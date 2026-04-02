import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.security import resolve_user
from app.schemas.events import (
    FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
)

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


class EmailIngestRequest(BaseModel):
    user_id: str | None = None
    from_address: str
    subject: str
    body: str


class SlackIngestRequest(BaseModel):
    user_id: str | None = None
    channel: str
    message: str


@router.post("/email")
async def ingest_email(body: EmailIngestRequest, request: Request):
    from app.workers.celery_app import celery_app
    user = await resolve_user(request, user_id=body.user_id)

    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=user.id,
            trace_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
        ),
        task_type=TaskType.DATA_INGESTION,
        payload=FounderEventPayload(
            source=Source.GMAIL,
            content_raw=f"Subject: {body.subject}\nFrom: {body.from_address}\n\n{body.body}",
            content_redacted="",
            context_tags=["email", "manual-ingest"],
            entities=[body.from_address],
            topic=body.subject,
        ),
    )
    celery_app.send_task("process_founder_event", args=[event.model_dump(mode="json")], priority=3)
    return {"status": "queued", "trace_id": event.metadata.trace_id}


@router.post("/slack")
async def ingest_slack(body: SlackIngestRequest, request: Request):
    from app.workers.celery_app import celery_app
    user = await resolve_user(request, user_id=body.user_id)

    channel = body.channel if body.channel.startswith("#") else f"#{body.channel}"
    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=user.id,
            trace_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
        ),
        task_type=TaskType.DATA_INGESTION,
        payload=FounderEventPayload(
            source=Source.SLACK,
            content_raw=f"Channel: {channel}\n\n{body.message}",
            content_redacted="",
            context_tags=["slack", "manual-ingest"],
            entities=[],
            topic=channel,
        ),
    )
    celery_app.send_task("process_founder_event", args=[event.model_dump(mode="json")], priority=3)
    return {"status": "queued", "trace_id": event.metadata.trace_id}
