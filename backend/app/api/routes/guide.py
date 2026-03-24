import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source

router = APIRouter(prefix="/api/guide", tags=["guide"])


class GuideRequest(BaseModel):
    question: str
    user_id: str


@router.post("")
async def ask_guide(body: GuideRequest):
    """Enqueue a GUIDE_QUERY task and return the task_id."""
    from app.workers.celery_app import celery_app

    trace_id = str(uuid.uuid4())
    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=uuid.UUID(body.user_id),
            trace_id=trace_id,
            timestamp=datetime.now(timezone.utc),
        ),
        task_type=TaskType.GUIDE_QUERY,
        payload=FounderEventPayload(
            source=Source.SLACK,  # guide queries are user-initiated
            content_raw=body.question,
            content_redacted=body.question,
            context_tags=["guide-query"],
            topic=body.question,
        ),
    )

    task = celery_app.send_task(
        "process_founder_event",
        args=[event.model_dump(mode="json")],
        priority=2,
    )

    return {"task_id": task.id, "trace_id": trace_id}
