import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.archive import Archive
from app.models.startup_profile import StartupProfile
from app.models.summary import Summary
from app.schemas.events import (
    FounderEvent,
    FounderEventMetadata,
    FounderEventPayload,
    Source,
    TaskType,
)
from app.workers.celery_app import celery_app


def _support_load_percent(session: Session, founder_id: uuid.UUID) -> float:
    window_start = datetime.now(timezone.utc) - timedelta(days=7)
    rows = session.execute(
        select(Archive).where(
            Archive.user_id == founder_id,
            Archive.ingested_at >= window_start,
        )
    ).scalars().all()
    if not rows:
        return 0.0

    support_items = 0
    for row in rows:
        tags = row.context_tags or []
        if any(tag in {"support", "customer"} for tag in tags):
            support_items += 1

    return round((support_items / len(rows)) * 100.0, 2)


def _already_triggered_today(session: Session, founder_id: uuid.UUID, topic: str) -> bool:
    window_start = datetime.now(timezone.utc) - timedelta(hours=24)
    existing = session.execute(
        select(Summary).where(
            Summary.user_id == founder_id,
            Summary.type == "GUIDE_MILESTONE",
            Summary.topic == topic,
            Summary.generated_at >= window_start,
        )
    ).scalar_one_or_none()
    return existing is not None


@celery_app.task(name="evaluate_founder_thresholds")
def evaluate_founder_thresholds(user_id: str | None = None):
    """
    Rule-based proactive checks:
    - If support load >20% and MRR >$10k, trigger a proactive "First Success Hire" guide card.
    """
    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    engine = create_engine(db_url)
    topic = "Milestone Trigger: First Success Hire"
    fired = 0

    with Session(engine) as session:
        profile_query = select(StartupProfile)
        if user_id:
            try:
                profile_query = profile_query.where(StartupProfile.user_id == uuid.UUID(user_id))
            except ValueError:
                return {"status": "error", "detail": "Invalid user_id"}
        profiles = session.execute(profile_query).scalars().all()

        for profile in profiles:
            mrr = float(profile.mrr_usd or 0.0)
            support_load = _support_load_percent(session, profile.user_id)
            if mrr <= 10_000 or support_load <= 20.0:
                continue
            if _already_triggered_today(session, profile.user_id, topic):
                continue

            question = (
                f"{topic}\n"
                f"Founder has ${mrr:,.0f} MRR and {support_load}% support load this week. "
                "Generate a practical framework for hiring the first customer success owner."
            )
            event = FounderEvent(
                metadata=FounderEventMetadata(
                    user_id=profile.user_id,
                    trace_id=str(uuid.uuid4()),
                    timestamp=datetime.now(timezone.utc),
                ),
                task_type=TaskType.GUIDE_QUERY,
                payload=FounderEventPayload(
                    source=Source.SLACK,
                    content_raw=question,
                    content_redacted=question,
                    context_tags=["guide-query", "milestone-trigger", "first-success-hire"],
                    topic=topic,
                    is_action_item=True,
                ),
            )
            celery_app.send_task(
                "process_founder_event",
                args=[event.model_dump(mode="json")],
                priority=1,
            )
            fired += 1

    return {"status": "ok", "triggered": fired}
