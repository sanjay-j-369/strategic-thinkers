"""
Real ingestion tasks for Gmail and Slack.
Only active when INGESTION_MODE=real.
"""
import os
from app.workers.celery_app import celery_app

DEMO_USER_ID = os.getenv("DEMO_USER_ID", "550e8400-e29b-41d4-a716-446655440000")


@celery_app.task(name="poll_gmail_real")
def poll_gmail_real():
    """Poll Gmail for unread emails, ingest them, and detect meeting requests."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.pipeline.encryption import decrypt
    from app.ingestion.gmail import GmailWorker

    engine = create_engine(os.environ.get("DATABASE_URL", "").replace("+asyncpg", ""))
    with Session(engine) as session:
        users = session.execute(
            select(User).where(User.google_token.isnot(None))
        ).scalars().all()

    for user in users:
        try:
            token_json = decrypt(str(user.id), user.google_token)
            worker = GmailWorker()
            worker.authenticate(token_json)
            events = worker.poll(str(user.id), max_results=10)
            _detect_and_save_meetings(str(user.id), worker, events)
            print(f"[Gmail] Polled for user {user.id}")
        except Exception as e:
            print(f"[Gmail] Error for user {user.id}: {e}")


MEETING_KEYWORDS = [
    "meeting", "call", "schedule", "calendar invite", "zoom", "google meet",
    "teams", "catch up", "sync", "discussion", "interview", "demo", "standup"
]


def _extract_gmeet_link(text: str) -> str | None:
    """Extract Google Meet link from email content."""
    import re
    patterns = [
        r'https://meet\.google\.com/[a-z0-9\-]+',
        r'https://zoom\.us/j/[0-9]+[^\s]*',
        r'https://teams\.microsoft\.com/l/meetup-join/[^\s]+',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def _detect_and_save_meetings(user_id: str, worker, events):
    """Detect meeting-related emails and save them as meetings."""
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.base import Base
    from app.models.user import User
    from app.models.summary import Summary

    if not events:
        return

    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)

    for event in events:
        content = event.payload.content_raw
        content_lower = content.lower()
        subject = event.payload.topic or ""
        entities = event.payload.entities or []

        # Check for GMeet/Zoom link first (highest priority)
        meet_link = _extract_gmeet_link(content)

        # Also check keywords
        is_meeting = meet_link or any(
            kw in content_lower or kw in subject.lower()
            for kw in MEETING_KEYWORDS
        )
        if not is_meeting:
            continue

        try:
            # Build summary text with meet link if found
            summary_parts = [f"Attendees: {', '.join(entities)}",
                             f"Scheduled: {datetime.now(timezone.utc).isoformat()}",
                             "Detected from email."]
            if meet_link:
                summary_parts.append(f"Meet Link: {meet_link}")

            with Session(engine) as session:
                meeting = Summary(
                    user_id=uuid.UUID(user_id),
                    type="MEETING",
                    topic=subject or "Meeting from email",
                    summary_text="\n".join(summary_parts),
                )
                session.add(meeting)
                session.commit()
            print(f"[Gmail] Detected meeting: {subject} | Link: {meet_link or 'none'}")

            # Trigger AI prep card
            from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
            prep_event = FounderEvent(
                metadata=FounderEventMetadata(
                    user_id=uuid.UUID(user_id),
                    trace_id=str(uuid.uuid4()),
                    timestamp=datetime.now(timezone.utc),
                ),
                task_type=TaskType.ASSISTANT_PREP,
                payload=FounderEventPayload(
                    source=Source.GMAIL,
                    content_raw=content,
                    content_redacted=content,
                    context_tags=["meeting-prep", "email-detected"],
                    entities=entities,
                    topic=subject,
                ),
            )
            celery_app.send_task(
                "process_founder_event",
                args=[prep_event.model_dump(mode="json")],
                priority=1,
            )
        except Exception as e:
            print(f"[Gmail] Meeting save error: {e}")


@celery_app.task(name="poll_slack_real")
def poll_slack_real():
    """Poll Slack channels and ingest messages."""
    from app.ingestion.slack import SlackWorker

    token = os.environ.get("SLACK_BOT_TOKEN", "")
    if not token or token.startswith("xoxb-..."):
        print("[Slack] No valid SLACK_BOT_TOKEN set, skipping.")
        return

    # Get channel list from env or use defaults
    channel_ids_raw = os.environ.get("SLACK_CHANNEL_IDS", "")
    if not channel_ids_raw:
        # Auto-discover public channels
        from slack_sdk import WebClient
        client = WebClient(token=token)
        result = client.conversations_list(types="public_channel", limit=10)
        channel_ids = [c["id"] for c in result.get("channels", [])]
    else:
        channel_ids = [c.strip() for c in channel_ids_raw.split(",")]

    worker = SlackWorker(token=token)
    worker.poll_channels(
        user_id=DEMO_USER_ID,
        channel_ids=channel_ids,
        limit=20,
    )
    print(f"[Slack] Polled {len(channel_ids)} channels")
