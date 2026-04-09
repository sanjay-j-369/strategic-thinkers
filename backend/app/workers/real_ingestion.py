"""
Real ingestion tasks for Gmail and Slack.
Only active when INGESTION_MODE=real.
"""
import hashlib
import os
from datetime import datetime, timezone

from app.runtime.queue import enqueue_task_sync
from app.runtime.task_names import TaskNames


def poll_gmail_real():
    """Poll Gmail for connected users, ingest new mail, and detect meetings."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.ingestion.gmail import GmailWorker
    from app.models.user import User
    from app.pipeline.encryption import decrypt

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
                events = worker.poll(
                    str(user.id),
                    max_results=10,
                    after=user.google_last_synced_at,
                )
                _detect_and_save_meetings(str(user.id), events)
                user.google_last_synced_at = datetime.now(timezone.utc)
                session.add(user)
                session.commit()
                print(f"[Gmail] Polled for user {user.id}")
            except Exception as exc:
                print(f"[Gmail] Error for user {user.id}: {exc}")


MEETING_KEYWORDS = [
    "meeting",
    "call",
    "schedule",
    "calendar invite",
    "zoom",
    "google meet",
    "teams",
    "catch up",
    "sync",
    "discussion",
    "interview",
    "demo",
    "standup",
]


def _extract_gmeet_link(text: str) -> str | None:
    """Extract Google Meet or equivalent meeting link from email content."""
    import re

    patterns = [
        r"https://meet\.google\.com/[a-z0-9\-]+",
        r"https://zoom\.us/j/[0-9]+[^\s]*",
        r"https://teams\.microsoft\.com/l/meetup-join/[^\s]+",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def _detect_and_save_meetings(user_id: str, events):
    """Detect meeting-related emails and save them as meetings."""
    import uuid
    from datetime import datetime, timezone

    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.models.base import Base
    from app.models.summary import Summary
    from app.schemas.events import (
        FounderEvent,
        FounderEventMetadata,
        FounderEventPayload,
        Source,
        TaskType,
    )

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

        meet_link = _extract_gmeet_link(content)
        is_meeting = meet_link or any(
            keyword in content_lower or keyword in subject.lower()
            for keyword in MEETING_KEYWORDS
        )
        if not is_meeting:
            continue

        source_ref = (
            "gmail-detected:"
            + hashlib.sha256(f"{subject}\n{content[:500]}".encode("utf-8")).hexdigest()
        )
        try:
            summary_parts = [
                f"Attendees: {', '.join(entities)}",
                f"Scheduled: {datetime.now(timezone.utc).isoformat()}",
                "Detected from email.",
            ]
            if meet_link:
                summary_parts.append(f"Meet Link: {meet_link}")

            with Session(engine) as session:
                existing = session.execute(
                    select(Summary).where(
                        Summary.user_id == uuid.UUID(user_id),
                        Summary.type == "MEETING",
                        Summary.source_ref == source_ref,
                    )
                ).scalar_one_or_none()
                if existing:
                    continue

                meeting = Summary(
                    user_id=uuid.UUID(user_id),
                    type="MEETING",
                    topic=subject or "Meeting from email",
                    summary_text="\n".join(summary_parts),
                    source_ref=source_ref,
                )
                session.add(meeting)
                session.commit()

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
                    source_id=source_ref,
                    source_url=meet_link,
                ),
            )
            enqueue_task_sync(
                TaskNames.FOUNDER_EVENT,
                {"event": prep_event.model_dump(mode="json")},
                priority=1,
            )
        except Exception as exc:
            print(f"[Gmail] Meeting save error: {exc}")


def poll_slack_real():
    """Poll Slack channels for each connected user."""
    import json

    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.ingestion.slack import SlackWorker
    from app.models.user import User
    from app.pipeline.encryption import decrypt

    engine = create_engine(os.environ.get("DATABASE_URL", "").replace("+asyncpg", ""))

    with Session(engine) as session:
        users = session.execute(
            select(User).where(User.slack_token.isnot(None))
        ).scalars().all()

        for user in users:
            try:
                token = decrypt(str(user.id), user.slack_token)
                worker = SlackWorker(token=token)
                channel_ids = json.loads(user.slack_channel_ids or "[]")
                if not channel_ids:
                    channel_ids = [channel["id"] for channel in worker.list_channels(limit=20)]

                worker.poll_channels(
                    user_id=str(user.id),
                    channel_ids=channel_ids,
                    limit=20,
                    oldest=user.slack_last_synced_at.timestamp()
                    if user.slack_last_synced_at
                    else None,
                )
                user.slack_last_synced_at = datetime.now(timezone.utc)
                session.add(user)
                session.commit()
                print(f"[Slack] Polled {len(channel_ids)} channels for {user.id}")
            except Exception as exc:
                print(f"[Slack] Error for user {user.id}: {exc}")
