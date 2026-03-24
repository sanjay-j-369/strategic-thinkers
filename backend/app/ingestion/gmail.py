import uuid
from datetime import datetime, timezone
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.pipeline.tagger import extract_tags


class GmailWorker:
    """Real Gmail poller using Google API client."""

    def __init__(self):
        self.service = None

    def authenticate(self, credentials_json: str):
        """Initialize the Gmail service with user credentials."""
        import json
        creds_data = json.loads(credentials_json)
        creds = Credentials(
            token=creds_data.get("token"),
            refresh_token=creds_data.get("refresh_token"),
            token_uri=creds_data.get("token_uri"),
            client_id=creds_data.get("client_id"),
            client_secret=creds_data.get("client_secret"),
        )
        self.service = build("gmail", "v1", credentials=creds)

    def poll(self, user_id: str, max_results: int = 10):
        """Poll recent Gmail messages and enqueue DATA_INGESTION events."""
        from app.workers.celery_app import celery_app

        if not self.service:
            raise RuntimeError("GmailWorker not authenticated. Call authenticate() first.")

        messages = (
            self.service.users()
            .messages()
            .list(userId="me", maxResults=max_results, q="is:unread")
            .execute()
            .get("messages", [])
        )

        events = []
        for msg_ref in messages:
            msg = (
                self.service.users()
                .messages()
                .get(userId="me", id=msg_ref["id"], format="full")
                .execute()
            )

            headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
            subject = headers.get("Subject", "")
            sender = headers.get("From", "")
            snippet = msg.get("snippet", "")

            content = f"Subject: {subject}\nFrom: {sender}\n\n{snippet}"
            tags = extract_tags(content)

            event = FounderEvent(
                metadata=FounderEventMetadata(
                    user_id=uuid.UUID(user_id),
                    trace_id=str(uuid.uuid4()),
                    timestamp=datetime.now(timezone.utc),
                ),
                task_type=TaskType.DATA_INGESTION,
                payload=FounderEventPayload(
                    source=Source.GMAIL,
                    content_raw=content,
                    content_redacted="",
                    context_tags=tags,
                    entities=[sender],
                    topic=subject,
                ),
            )

            celery_app.send_task(
                "process_founder_event",
                args=[event.model_dump(mode="json")],
                priority=2,
            )
            events.append(event)

        return events
