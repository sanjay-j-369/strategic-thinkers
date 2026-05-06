import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import delete, select

from app.runtime.task_names import TaskNames
from app.security import resolve_user

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class MeetingRequest(BaseModel):
    user_id: str | None = None
    topic: str
    attendees: list[str] = []
    scheduled_at: Optional[str] = None


def _meeting_source_ref(meeting_id: str) -> str:
    return f"manual-meeting:{meeting_id}"


@router.post("")
async def schedule_meeting(body: MeetingRequest, request: Request, background_tasks: BackgroundTasks):
    from app.models.summary import Summary
    from app.schemas.events import (
        FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
    )

    user = await resolve_user(request, user_id=body.user_id)
    scheduled_at = body.scheduled_at or datetime.now(timezone.utc).isoformat()
    meeting_id = str(uuid.uuid4())

    # Save as a summary record so it shows in meetings list
    async_session = request.app.state.async_session
    async with async_session() as session:
        meeting = Summary(
            id=uuid.UUID(meeting_id),
            user_id=user.id,
            type="MEETING",
            topic=body.topic,
            source_ref=_meeting_source_ref(meeting_id),
            summary_text=f"Attendees: {', '.join(body.attendees)}\nScheduled: {scheduled_at}",
        )
        session.add(meeting)
        await session.commit()
        await session.refresh(meeting)

    # Trigger AI prep card via Celery
    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=user.id,
            trace_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
        ),
        task_type=TaskType.ASSISTANT_PREP,
        payload=FounderEventPayload(
            source=Source.CALENDAR,
            content_raw=f"Meeting: {body.topic}\nAttendees: {', '.join(body.attendees)}",
            content_redacted=f"Meeting: {body.topic}\nAttendees: {', '.join(body.attendees)}",
            context_tags=["meeting-prep"],
            entities=body.attendees,
            topic=body.topic,
            source_id=f"manual-meeting:{meeting_id}",
        ),
    )
    await request.app.state.task_queue.enqueue(
        TaskNames.FOUNDER_EVENT,
        {"event": event.model_dump(mode="json")},
        priority=1,
    )
    background_tasks.add_task(
        request.app.state.notification_bus.publish_to_user,
        str(user.id),
        {
            "notification_type": "TASK_QUEUED",
            "severity": "info",
            "title": "Meeting prep requested",
            "body": body.topic,
            "payload": {"meeting_id": meeting_id},
        },
    )

    return {"status": "scheduled", "id": meeting_id}


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    request: Request,
):
    from app.models.agent_notification import AgentNotification
    from app.models.summary import Summary
    from app.models.task_queue import TaskQueue

    user = await resolve_user(request)
    try:
        parsed_meeting_id = uuid.UUID(meeting_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid meeting id") from exc

    source_ref = _meeting_source_ref(str(parsed_meeting_id))
    async_session = request.app.state.async_session
    async with async_session() as session:
        meeting = (
            await session.execute(
                select(Summary).where(
                    Summary.id == parsed_meeting_id,
                    Summary.user_id == user.id,
                    Summary.type == "MEETING",
                )
            )
        ).scalar_one_or_none()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")

        prep_exists = await session.scalar(
            select(Summary.id).where(
                Summary.user_id == user.id,
                Summary.type == "ASSISTANT_PREP",
                Summary.source_ref == source_ref,
            )
        )
        if prep_exists:
            raise HTTPException(
                status_code=409,
                detail="This meeting already has prep and cannot be deleted until the prep card is removed.",
            )

        await session.execute(
            delete(TaskQueue).where(
                TaskQueue.task_name == TaskNames.FOUNDER_EVENT,
                TaskQueue.payload["event"]["payload"]["source_id"].astext == source_ref,
            )
        )
        await session.execute(
            delete(AgentNotification).where(
                AgentNotification.user_id == user.id,
                AgentNotification.payload["meeting_id"].astext == str(parsed_meeting_id),
            )
        )
        await session.delete(meeting)
        await session.commit()

    return {"status": "deleted", "id": meeting_id}


@router.get("")
async def list_meetings(
    request: Request,
    user_id: str | None = Query(None),
    limit: int = Query(20),
):
    from app.models.summary import Summary
    user = await resolve_user(request, user_id=user_id)

    async_session = request.app.state.async_session
    async with async_session() as session:
        prep_rows = (
            await session.execute(
                select(Summary.source_ref)
                .where(
                    Summary.user_id == user.id,
                    Summary.type == "ASSISTANT_PREP",
                    Summary.source_ref.isnot(None),
                )
            )
        ).scalars().all()
        prep_source_refs = {row for row in prep_rows if row}

        result = await session.execute(
            select(Summary)
            .where(Summary.user_id == user.id, Summary.type == "MEETING")
            .order_by(Summary.generated_at.desc())
            .limit(limit)
        )
        rows = result.scalars().all()

    meetings = []
    for r in rows:
        # Parse attendees and scheduled_at from summary_text
        lines = (r.summary_text or "").split("\n")
        attendees = []
        scheduled_at = r.generated_at.isoformat() if r.generated_at else ""
        for line in lines:
            if line.startswith("Attendees:"):
                raw = line.replace("Attendees:", "").strip()
                attendees = [a.strip() for a in raw.split(",") if a.strip()]
            if line.startswith("Scheduled:"):
                scheduled_at = line.replace("Scheduled:", "").strip()

        source_ref = _meeting_source_ref(str(r.id))
        status = "past"
        if source_ref in prep_source_refs:
            status = "prepped"
        else:
            try:
                scheduled_dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
                status = "upcoming" if scheduled_dt > datetime.now(timezone.utc) else "past"
            except Exception:
                status = "past"

        meetings.append({
            "id": str(r.id),
            "topic": r.topic or "",
            "attendees": attendees,
            "scheduled_at": scheduled_at,
            "summary": r.summary_text,
            "status": status,
        })

    return {"meetings": meetings, "total": len(meetings)}
