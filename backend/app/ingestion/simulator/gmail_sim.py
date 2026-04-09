import uuid
import random
from datetime import datetime, timezone

from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.ingestion.simulator.fixtures import FAKE_EMAILS
from app.ingestion.simulator.config import SIM_CONFIG
from app.pipeline.action_items import detect_action_item_signal
from app.runtime.queue import enqueue_task_sync
from app.runtime.task_names import TaskNames


class GmailSimulator:
    """Picks a random email from FAKE_EMAILS and enqueues a DATA_INGESTION event."""

    def poll(self, user_id: str | None = None):
        """Emit a fake Gmail DATA_INGESTION event."""
        uid = user_id or str(uuid.uuid4())
        email = random.choice(FAKE_EMAILS)
        thread_id = email.get("thread_id") or str(uuid.uuid4())
        content = f"Subject: {email['subject']}\nFrom: {email['from']}\n\n{email['body']}"

        event = FounderEvent(
            metadata=FounderEventMetadata(
                user_id=uuid.UUID(uid) if isinstance(uid, str) else uid,
                trace_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
            ),
            task_type=TaskType.DATA_INGESTION,
            payload=FounderEventPayload(
                source=Source.GMAIL,
                content_raw=content,
                content_redacted="",  # Will be filled by PII pipeline
                context_tags=email["tags"],
                entities=[email["from"]],
                topic=email["subject"],
                source_id=thread_id,
                source_url=f"https://mail.google.com/mail/u/0/#all/{thread_id}",
                is_action_item=detect_action_item_signal(content, email["tags"]),
            ),
        )

        enqueue_task_sync(
            TaskNames.FOUNDER_EVENT,
            {"event": event.model_dump(mode="json")},
            priority=2,
        )
        return event
