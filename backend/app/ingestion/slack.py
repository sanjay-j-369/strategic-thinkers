import uuid
from datetime import datetime, timezone
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from app.runtime.queue import enqueue_task_sync
from app.runtime.task_names import TaskNames
from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.pipeline.tagger import extract_tags
from app.pipeline.action_items import detect_action_item_signal


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
        event = payload.get("event", {})
        text = event.get("text", "")
        channel = event.get("channel", "")
        user = event.get("user", "")
        ts = event.get("ts", "")

        if not text:
            return None

        content = f"Channel: {channel}\nUser: {user}\n\n{text}"
        tags = extract_tags(content)
        source_url = self._permalink(channel, ts) if channel and ts else None

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
                source_id=f"{channel}:{ts}" if ts else channel,
                source_url=source_url,
                is_action_item=detect_action_item_signal(content, tags),
            ),
        )

        enqueue_task_sync(
            TaskNames.FOUNDER_EVENT,
            {"event": founder_event.model_dump(mode="json")},
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

                    ts = msg.get("ts", "")
                    content = f"Channel: {channel_id}\n\n{text}"
                    tags = extract_tags(content)
                    source_url = self._permalink(channel_id, ts) if ts else None

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
                            source_id=f"{channel_id}:{ts}" if ts else channel_id,
                            source_url=source_url,
                            is_action_item=detect_action_item_signal(content, tags),
                        ),
                    )

                    enqueue_task_sync(
                        TaskNames.FOUNDER_EVENT,
                        {"event": event.model_dump(mode="json")},
                        priority=2,
                    )
                    events.append(event)
            except SlackApiError:
                pass

        return events

    def _permalink(self, channel: str, ts: str) -> str | None:
        if not self.client:
            return None
        try:
            response = self.client.chat_getPermalink(channel=channel, message_ts=ts)
            return response.get("permalink")
        except SlackApiError:
            return None
