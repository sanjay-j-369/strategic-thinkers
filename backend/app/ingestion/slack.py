import uuid
from datetime import datetime, timezone
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.pipeline.tagger import extract_tags


class SlackWorker:
    """Real Slack worker using slack_sdk."""

    def __init__(self, token: str | None = None):
        self.client = WebClient(token=token) if token else None

    def authenticate(self, token: str):
        self.client = WebClient(token=token)

    def list_channels(self, limit: int = 100):
        if not self.client:
            raise RuntimeError("SlackWorker not authenticated.")

        response = self.client.conversations_list(
            types="public_channel,private_channel",
            exclude_archived=True,
            limit=limit,
        )
        channels = []
        for channel in response.get("channels", []):
            channels.append(
                {
                    "id": channel.get("id"),
                    "name": channel.get("name"),
                    "is_private": channel.get("is_private", False),
                }
            )
        return channels

    def handle_webhook(self, payload: dict, user_id: str):
        """Handle incoming Slack webhook event and enqueue DATA_INGESTION."""
        from app.workers.celery_app import celery_app

        event = payload.get("event", {})
        text = event.get("text", "")
        channel = event.get("channel", "")
        user = event.get("user", "")

        if not text:
            return None

        content = f"Channel: {channel}\nUser: {user}\n\n{text}"
        tags = extract_tags(content)

        founder_event = FounderEvent(
            metadata=FounderEventMetadata(
                user_id=uuid.UUID(user_id),
                trace_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
            ),
            task_type=TaskType.DATA_INGESTION,
            payload=FounderEventPayload(
                source=Source.SLACK,
                content_raw=content,
                content_redacted="",
                context_tags=tags,
                entities=[user],
                topic=channel,
            ),
        )

        celery_app.send_task(
            "process_founder_event",
            args=[founder_event.model_dump(mode="json")],
            priority=2,
        )
        return founder_event

    def poll_channels(
        self,
        user_id: str,
        channel_ids: list[str],
        limit: int = 10,
        oldest: float | None = None,
    ):
        """Poll recent messages from specified channels."""
        from app.workers.celery_app import celery_app

        if not self.client:
            raise RuntimeError("SlackWorker not authenticated.")

        events = []
        for channel_id in channel_ids:
            try:
                request_kwargs = {"channel": channel_id, "limit": limit}
                if oldest is not None:
                    request_kwargs["oldest"] = str(oldest)
                result = self.client.conversations_history(**request_kwargs)
                for msg in result.get("messages", []):
                    text = msg.get("text", "")
                    if not text:
                        continue

                    content = f"Channel: {channel_id}\n\n{text}"
                    tags = extract_tags(content)

                    event = FounderEvent(
                        metadata=FounderEventMetadata(
                            user_id=uuid.UUID(user_id),
                            trace_id=str(uuid.uuid4()),
                            timestamp=datetime.now(timezone.utc),
                        ),
                        task_type=TaskType.DATA_INGESTION,
                        payload=FounderEventPayload(
                            source=Source.SLACK,
                            content_raw=content,
                            content_redacted="",
                            context_tags=tags,
                            entities=[],
                            topic=channel_id,
                        ),
                    )

                    celery_app.send_task(
                        "process_founder_event",
                        args=[event.model_dump(mode="json")],
                        priority=2,
                    )
                    events.append(event)
            except SlackApiError:
                pass

        return events
