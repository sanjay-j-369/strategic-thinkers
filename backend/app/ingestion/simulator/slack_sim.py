import uuid
import random
from datetime import datetime, timezone

from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.ingestion.simulator.fixtures import FAKE_SLACK_MESSAGES
from app.ingestion.simulator.config import SIM_CONFIG
from app.pipeline.action_items import detect_action_item_signal


class SlackSimulator:
    """Picks a random Slack message from FAKE_SLACK_MESSAGES and enqueues a DATA_INGESTION event."""

    def poll(self, user_id: str | None = None):
        """Emit a fake Slack DATA_INGESTION event."""
        from app.workers.celery_app import celery_app

        uid = user_id or str(uuid.uuid4())
        msg = random.choice(FAKE_SLACK_MESSAGES)
        ts = msg.get("message_ts", "1711900000.000100")
        channel_clean = msg["channel"].lstrip("#")
        source_url = f"https://app.slack.com/client/TDEMO/{channel_clean}/thread/{channel_clean}-{ts.replace('.', '')}"
        content = f"Channel: {msg['channel']}\n\n{msg['text']}"

        event = FounderEvent(
            metadata=FounderEventMetadata(
                user_id=uuid.UUID(uid) if isinstance(uid, str) else uid,
                trace_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
            ),
            task_type=TaskType.DATA_INGESTION,
            payload=FounderEventPayload(
                source=Source.SLACK,
                content_raw=content,
                content_redacted="",  # Will be filled by PII pipeline
                context_tags=msg["tags"],
                entities=[],
                topic=msg["channel"],
                source_id=f"{msg['channel']}:{ts}",
                source_url=source_url,
                is_action_item=detect_action_item_signal(content, msg["tags"]),
            ),
        )

        celery_app.send_task(
            "process_founder_event",
            args=[event.model_dump(mode="json")],
            priority=2,
        )
        return event
