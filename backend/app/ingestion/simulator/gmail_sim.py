import uuid
import random
from datetime import datetime, timezone

from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.ingestion.simulator.fixtures import FAKE_EMAILS
from app.ingestion.simulator.config import SIM_CONFIG


class GmailSimulator:
    """Picks a random email from FAKE_EMAILS and enqueues a DATA_INGESTION event."""

    def poll(self, user_id: str | None = None):
        """Emit a fake Gmail DATA_INGESTION event."""
        from app.workers.celery_app import celery_app

        uid = user_id or str(uuid.uuid4())
        email = random.choice(FAKE_EMAILS)

        event = FounderEvent(
            metadata=FounderEventMetadata(
                user_id=uuid.UUID(uid) if isinstance(uid, str) else uid,
                trace_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
            ),
            task_type=TaskType.DATA_INGESTION,
            payload=FounderEventPayload(
                source=Source.GMAIL,
                content_raw=f"Subject: {email['subject']}\nFrom: {email['from']}\n\n{email['body']}",
                content_redacted="",  # Will be filled by PII pipeline
                context_tags=email["tags"],
                entities=[email["from"]],
                topic=email["subject"],
            ),
        )

        celery_app.send_task(
            "process_founder_event",
            args=[event.model_dump(mode="json")],
            priority=2,
        )
        return event
