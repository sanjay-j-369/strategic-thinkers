import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel

from app.runtime.task_names import TaskNames
from app.security import resolve_user
from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source

router = APIRouter(prefix="/api/guide", tags=["guide"])


class GuideRequest(BaseModel):
    question: str
    user_id: str | None = None


@router.post("")
async def ask_guide(body: GuideRequest, request: Request, background_tasks: BackgroundTasks):
    """Enqueue a GUIDE_QUERY task and return the task_id."""
    user = await resolve_user(request, user_id=body.user_id)
    trace_id = str(uuid.uuid4())

    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=user.id,
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

    task_id = await request.app.state.task_queue.enqueue(
        TaskNames.FOUNDER_EVENT,
        {"event": event.model_dump(mode="json")},
        priority=2,
    )
    background_tasks.add_task(
        request.app.state.notification_bus.publish_to_user,
        str(user.id),
        {
            "notification_type": "TASK_QUEUED",
            "severity": "info",
            "title": "Guide request queued",
            "body": body.question[:180],
            "payload": {"trace_id": trace_id, "task_id": task_id},
        },
    )

    return {"task_id": task_id, "trace_id": trace_id}
