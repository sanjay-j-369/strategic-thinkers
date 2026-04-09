import os
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.archive import Archive
from app.models.base import Base
from app.models.pii_vault import PiiVault
from app.models.startup_profile import StartupProfile
from app.models.summary import Summary
from app.models.user import User
from app.pipeline.action_items import detect_action_item_signal
from app.runtime.queue import enqueue_task_sync
from app.runtime.task_names import TaskNames
from app.schemas.events import (
    FounderEvent,
    FounderEventMetadata,
    FounderEventPayload,
    Source,
    TaskType,
)


DEMO_GMAIL_EVENTS = [
    {
        "subject": "Re: Enterprise pilot timeline",
        "from": "marcus@client-co.com",
        "thread_id": "demo-gmail-001",
        "body": (
            "Hi Alex, this is Marcus from ClientCo. "
            "We are still blocked by the API rate-limit issue for Acme Health. "
            "You promised a fix by Friday and asked us to share logs. "
            "Can you confirm owner + ETA? You can call me at +1-415-555-0184."
        ),
        "tags": ["customer", "gtm", "action-item"],
    },
    {
        "subject": "Support queue escalation",
        "from": "ops@acme-app.io",
        "thread_id": "demo-gmail-002",
        "body": (
            "Alex, 42% of this week's founder time went to support. "
            "No first support hire yet. "
            "Open loop: define support handoff owner and hiring scorecard by Monday."
        ),
        "tags": ["customer", "support", "action-item"],
    },
    {
        "subject": "Runway and hiring sanity check",
        "from": "sarah@vc-firm.com",
        "thread_id": "demo-gmail-003",
        "body": (
            "Burn jumped 25% month-over-month while MRR is near $12k. "
            "Before we discuss the next round, please share a concrete spend-control plan."
        ),
        "tags": ["investor", "burn", "fundraise"],
    },
]

DEMO_SLACK_EVENTS = [
    {
        "channel": "#founders",
        "user": "alex",
        "message_ts": "1711912300.000100",
        "text": (
            "Burn jumped 25% this month with no matching MRR growth. "
            "Action item: finalize spend cuts and share runway plan before Monday."
        ),
        "tags": ["burn", "fundraise", "action-item"],
    },
    {
        "channel": "#growth",
        "user": "jane",
        "message_ts": "1711913300.000200",
        "text": (
            "At $12k MRR, investors want proof of retention before the next round. "
            "Question still unresolved: who owns weekly churn review?"
        ),
        "tags": ["investor", "fundraise", "action-item"],
    },
    {
        "channel": "#support",
        "user": "ops-lead",
        "message_ts": "1711914300.000300",
        "text": (
            "Support queue breached SLA again. "
            "We need a dedicated customer success owner this sprint."
        ),
        "tags": ["customer", "support", "action-item"],
    },
]

DEMO_PREP_EVENT = {
    "topic": "Weekly customer escalation sync",
    "attendees": ["marcus@client-co.com", "ops@acme-app.io"],
    "source_id": "demo-calendar-escalation-sync",
    "source_url": "https://calendar.google.com/calendar/u/0/r/week",
}

DEMO_PROFILE = {
    "stage": "seed",
    "mrr_usd": 12_000,
    "burn_rate_usd": 18_750,
    "runway_months": 11,
    "headcount": 6,
    "has_cto": True,
    "dev_spend_pct": 0.34,
}


def get_demo_user_id() -> uuid.UUID:
    return uuid.UUID(settings.DEMO_USER_ID)


def _database_url() -> str:
    return os.environ.get("DATABASE_URL", settings.DATABASE_URL).replace("+asyncpg", "")


def _purge_demo_vectors(user_id: str):
    try:
        from pinecone import Pinecone

        pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", ""))
        index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))
        index.delete(namespace="founder_memory", filter={"user_id": user_id})
    except Exception:
        pass


def ensure_demo_persona(*, reset: bool = False) -> dict:
    """
    Ensure deterministic demo founder profile exists.
    If reset=True, clear all processed artifacts for the demo user.
    """
    demo_user_id = get_demo_user_id()
    engine = create_engine(_database_url())
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        user = session.execute(select(User).where(User.id == demo_user_id)).scalar_one_or_none()
        if user is None:
            user = User(
                id=demo_user_id,
                email="alex@demo-founders.ai",
                full_name="Alex Chen",
                password_hash=None,
            )
            session.add(user)
            session.flush()
        elif not user.full_name:
            user.full_name = "Alex Chen"

        profile = session.execute(
            select(StartupProfile).where(StartupProfile.user_id == demo_user_id)
        ).scalar_one_or_none()
        if profile is None:
            profile = StartupProfile(user_id=demo_user_id, **DEMO_PROFILE)
            session.add(profile)
        else:
            profile.stage = DEMO_PROFILE["stage"]
            profile.mrr_usd = DEMO_PROFILE["mrr_usd"]
            profile.burn_rate_usd = DEMO_PROFILE["burn_rate_usd"]
            profile.runway_months = DEMO_PROFILE["runway_months"]
            profile.headcount = DEMO_PROFILE["headcount"]
            profile.has_cto = DEMO_PROFILE["has_cto"]
            profile.dev_spend_pct = DEMO_PROFILE["dev_spend_pct"]

        if reset:
            session.execute(delete(Archive).where(Archive.user_id == demo_user_id))
            session.execute(delete(Summary).where(Summary.user_id == demo_user_id))
            session.execute(delete(PiiVault).where(PiiVault.user_id == demo_user_id))

        session.commit()

    if reset:
        _purge_demo_vectors(str(demo_user_id))

    return {"user_id": str(demo_user_id)}


def _enqueue_data_ingestion_event(
    *,
    user_id: uuid.UUID,
    source: Source,
    content_raw: str,
    topic: str,
    entities: list[str],
    context_tags: list[str],
    source_id: str,
    source_url: str | None,
) -> str:
    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=user_id,
            trace_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
        ),
        task_type=TaskType.DATA_INGESTION,
        payload=FounderEventPayload(
            source=source,
            content_raw=content_raw,
            content_redacted="",
            context_tags=context_tags,
            entities=entities,
            topic=topic,
            source_id=source_id,
            source_url=source_url,
            is_action_item=detect_action_item_signal(content_raw, context_tags),
        ),
    )
    return enqueue_task_sync(
        TaskNames.FOUNDER_EVENT,
        {"event": event.model_dump(mode="json")},
        priority=2,
    )


def enqueue_demo_history(
    *,
    source: str = "all",
    mode: str = "single",  # "single" | "full"
    include_prep: bool = False,
    include_growth: bool = False,
) -> dict:
    """Enqueue realistic demo events through the normal worker pipeline."""
    demo_user_id = get_demo_user_id()
    queued_task_ids: list[str] = []

    emails = DEMO_GMAIL_EVENTS if mode == "full" else [random.choice(DEMO_GMAIL_EVENTS)]
    slack_messages = DEMO_SLACK_EVENTS if mode == "full" else [random.choice(DEMO_SLACK_EVENTS)]

    if source in {"all", "gmail"}:
        for email in emails:
            content = f"Subject: {email['subject']}\nFrom: {email['from']}\n\n{email['body']}"
            source_url = f"https://mail.google.com/mail/u/0/#all/{email['thread_id']}"
            queued_task_ids.append(
                _enqueue_data_ingestion_event(
                    user_id=demo_user_id,
                    source=Source.GMAIL,
                    content_raw=content,
                    topic=email["subject"],
                    entities=[email["from"]],
                    context_tags=email["tags"],
                    source_id=email["thread_id"],
                    source_url=source_url,
                )
            )

    if source in {"all", "slack"}:
        for msg in slack_messages:
            channel = msg["channel"]
            clean = channel.lstrip("#")
            ts = msg["message_ts"]
            source_url = f"https://app.slack.com/client/TDEMO/{clean}/thread/{clean}-{ts.replace('.', '')}"
            content = f"Channel: {channel}\nUser: {msg['user']}\n\n{msg['text']}"
            queued_task_ids.append(
                _enqueue_data_ingestion_event(
                    user_id=demo_user_id,
                    source=Source.SLACK,
                    content_raw=content,
                    topic=channel,
                    entities=[msg["user"]],
                    context_tags=msg["tags"],
                    source_id=f"{clean}:{ts}",
                    source_url=source_url,
                )
            )

    if include_prep:
        prep = DEMO_PREP_EVENT
        event = FounderEvent(
            metadata=FounderEventMetadata(
                user_id=demo_user_id,
                trace_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
            ),
            task_type=TaskType.ASSISTANT_PREP,
            payload=FounderEventPayload(
                source=Source.CALENDAR,
                content_raw=f"Meeting: {prep['topic']}\nAttendees: {', '.join(prep['attendees'])}",
                content_redacted=f"Meeting: {prep['topic']}\nAttendees: {', '.join(prep['attendees'])}",
                context_tags=["meeting-prep", "demo", "action-item"],
                entities=prep["attendees"],
                topic=prep["topic"],
                source_id=prep["source_id"],
                source_url=prep["source_url"],
            ),
        )
        task_id = enqueue_task_sync(
            TaskNames.FOUNDER_EVENT,
            {"event": event.model_dump(mode="json")},
            priority=1,
        )
        queued_task_ids.append(task_id)

    if include_growth:
        question = (
            "Milestone Trigger: First Success Hire\n"
            "Founder has >$10k MRR and rising support load. "
            "Build a practical framework for first customer success hire timing and scope."
        )
        event = FounderEvent(
            metadata=FounderEventMetadata(
                user_id=demo_user_id,
                trace_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
            ),
            task_type=TaskType.GUIDE_QUERY,
            payload=FounderEventPayload(
                source=Source.SLACK,
                content_raw=question,
                content_redacted=question,
                context_tags=["guide-query", "milestone-trigger", "first-success-hire"],
                topic="Milestone Trigger: First Success Hire",
                is_action_item=True,
            ),
        )
        task_id = enqueue_task_sync(
            TaskNames.FOUNDER_EVENT,
            {"event": event.model_dump(mode="json")},
            priority=1,
        )
        queued_task_ids.append(task_id)

    return {"user_id": str(demo_user_id), "queued": len(queued_task_ids), "task_ids": queued_task_ids}


def get_demo_snapshot() -> dict:
    demo_user_id = get_demo_user_id()
    engine = create_engine(_database_url())

    with Session(engine) as session:
        profile = session.execute(
            select(StartupProfile).where(StartupProfile.user_id == demo_user_id)
        ).scalar_one_or_none()
        archive_count = session.scalar(
            select(func.count()).select_from(Archive).where(Archive.user_id == demo_user_id)
        ) or 0
        summary_count = session.scalar(
            select(func.count()).select_from(Summary).where(Summary.user_id == demo_user_id)
        ) or 0
        recent = session.execute(
            select(Summary)
            .where(Summary.user_id == demo_user_id)
            .order_by(Summary.generated_at.desc())
            .limit(1)
        ).scalar_one_or_none()

    return {
        "user_id": str(demo_user_id),
        "profile": profile.to_dict() if profile else None,
        "archive_count": archive_count,
        "summary_count": summary_count,
        "latest_summary_at": recent.generated_at.isoformat() if recent else None,
    }
