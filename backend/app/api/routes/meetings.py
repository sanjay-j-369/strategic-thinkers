import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class MeetingRequest(BaseModel):
    user_id: str
    topic: str
    attendees: list[str] = []
    scheduled_at: Optional[str] = None


def _safe_uuid(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError:
        return uuid.uuid4()


@router.post("")
async def schedule_meeting(body: MeetingRequest, request: Request):
    from app.models.summary import Summary
    from app.schemas.events import (
        FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
    )
    from app.workers.celery_app import celery_app

    user_uuid = _safe_uuid(body.user_id)
    scheduled_at = body.scheduled_at or datetime.now(timezone.utc).isoformat()

    # Save as a summary record so it shows in meetings list
    async_session = request.app.state.async_session
    async with async_session() as session:
        meeting = Summary(
            user_id=user_uuid,
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
            user_id=user_uuid,
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
        ),
    )
    celery_app.send_task("process_founder_event", args=[event.model_dump(mode="json")], priority=1)

    return {"status": "scheduled", "id": meeting_id}


@router.get("")
async def list_meetings(
    request: Request,
    user_id: str = Query(...),
    limit: int = Query(20),
):
    from app.models.summary import Summary

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Summary)
            .where(Summary.user_id == _safe_uuid(user_id), Summary.type == "MEETING")
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
            "status": "upcoming",
        })

    return {"meetings": meetings, "total": len(meetings)}
