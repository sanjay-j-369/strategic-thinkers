import json
import os
import uuid
from datetime import datetime, timedelta, timezone

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.schemas.events import (
    FounderEvent,
    FounderEventMetadata,
    FounderEventPayload,
    Source,
    TaskType,
)
from app.workers.celery_app import celery_app


def _build_google_credentials(credentials_json: str) -> Credentials:
    creds_data = json.loads(credentials_json)
    return Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri"),
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
    )


def _extract_event_start(event: dict) -> datetime | None:
    start = event.get("start", {})
    value = start.get("dateTime")
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def sync_calendar_events_for_user(
    user_id: str,
    user_email: str,
    credentials_json: str,
    lookahead_days: int = 14,
) -> dict:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.models.summary import Summary

    service = build("calendar", "v3", credentials=_build_google_credentials(credentials_json))
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=lookahead_days)
    events = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=horizon.isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
        .get("items", [])
    )

    created = 0
    prep_queued = 0
    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    engine = create_engine(db_url)

    with Session(engine) as session:
        for event in events:
            event_id = event.get("id")
            if not event_id:
                continue

            source_ref = f"google-calendar:{event_id}"
            attendees = [
                attendee.get("email")
                for attendee in event.get("attendees", [])
                if attendee.get("email") and attendee.get("email") != user_email
            ]
            start_at = _extract_event_start(event)
            meet_link = event.get("hangoutLink")
            summary_parts = [
                f"Attendees: {', '.join(attendees)}",
                f"Scheduled: {start_at.isoformat() if start_at else now.isoformat()}",
            ]
            if meet_link:
                summary_parts.append(f"Meet Link: {meet_link}")

            existing = session.execute(
                select(Summary).where(
                    Summary.user_id == uuid.UUID(user_id),
                    Summary.type == "MEETING",
                    Summary.source_ref == source_ref,
                )
            ).scalar_one_or_none()

            if existing is None:
                created += 1
                meeting = Summary(
                    user_id=uuid.UUID(user_id),
                    type="MEETING",
                    topic=event.get("summary") or "Calendar meeting",
                    summary_text="\n".join(summary_parts),
                    source_ref=source_ref,
                )
                session.add(meeting)

                founder_event = FounderEvent(
                    metadata=FounderEventMetadata(
                        user_id=uuid.UUID(user_id),
                        trace_id=str(uuid.uuid4()),
                        timestamp=datetime.now(timezone.utc),
                    ),
                    task_type=TaskType.ASSISTANT_PREP,
                    payload=FounderEventPayload(
                        source=Source.CALENDAR,
                        content_raw=f"Meeting: {event.get('summary', 'Meeting')}\nAttendees: {', '.join(attendees)}",
                        content_redacted=f"Meeting: {event.get('summary', 'Meeting')}\nAttendees: {', '.join(attendees)}",
                        context_tags=["meeting-prep", "calendar-sync"],
                        entities=attendees,
                        topic=event.get("summary", "Meeting"),
                    ),
                )
                celery_app.send_task(
                    "process_founder_event",
                    args=[founder_event.model_dump(mode="json")],
                    priority=1,
                )
                prep_queued += 1
            else:
                existing.topic = event.get("summary") or existing.topic
                existing.summary_text = "\n".join(summary_parts)

        session.commit()

    return {
        "new_meetings": created,
        "prep_queued": prep_queued,
    }


@celery_app.task(name="poll_calendar_events")
def poll_calendar_events():
    """Poll Google Calendar for upcoming meetings across all connected users."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

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
            sync_calendar_events_for_user(
                user_id=str(user.id),
                user_email=user.email,
                credentials_json=token_json,
                lookahead_days=2,
            )
        except Exception as exc:
            print(f"Calendar poll error for user {user.id}: {exc}")
