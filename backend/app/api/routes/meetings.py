import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Request, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select

from app.runtime.task_names import TaskNames
from app.security import resolve_user

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class MeetingRequest(BaseModel):
    user_id: str | None = None
    topic: str
    attendees: list[str] = []
    scheduled_at: Optional[str] = None


@router.post("")
async def schedule_meeting(body: MeetingRequest, request: Request, background_tasks: BackgroundTasks):
    from app.models.summary import Summary
    from app.schemas.events import (
        FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
    )

    user = await resolve_user(request, user_id=body.user_id)
    scheduled_at = body.scheduled_at or datetime.now(timezone.utc).isoformat()

    # Save as a summary record so it shows in meetings list
    async_session = request.app.state.async_session
    async with async_session() as session:
        meeting = Summary(
            user_id=user.id,
            type="MEETING",
            topic=body.topic,
            summary_text=f"Attendees: {', '.join(body.attendees)}\nScheduled: {scheduled_at}",
        )
        session.add(meeting)
        await session.commit()
        await session.refresh(meeting)
        meeting_id = str(meeting.id)

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

        meetings.append({
            "id": str(r.id),
            "topic": r.topic or "",
            "attendees": attendees,
            "scheduled_at": scheduled_at,
            "summary": r.summary_text,
            "status": "upcoming",
        })

    return {"meetings": meetings, "total": len(meetings)}
