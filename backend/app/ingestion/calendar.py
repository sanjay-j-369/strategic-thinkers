import uuid
from datetime import datetime, timezone, timedelta
from googleapiclient.discovery import build

from app.workers.celery_app import celery_app
from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source


@celery_app.task(name="poll_calendar_events")
def poll_calendar_events():
    """Poll Google Calendar for meetings starting in the next 30 minutes."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.pipeline.encryption import decrypt
    import os

    engine = create_engine(os.environ.get("DATABASE_URL", "").replace("+asyncpg", ""))

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(minutes=30)

    with Session(engine) as session:
        users = session.execute(
            select(User).where(User.google_token.isnot(None))
        ).scalars().all()

        for user in users:
            try:
                token_json = decrypt(str(user.id), user.google_token)
                import json
                from google.oauth2.credentials import Credentials

                creds_data = json.loads(token_json)
                creds = Credentials(
                    token=creds_data.get("token"),
                    refresh_token=creds_data.get("refresh_token"),
                    token_uri=creds_data.get("token_uri"),
                    client_id=creds_data.get("client_id"),
                    client_secret=creds_data.get("client_secret"),
                )
                service = build("calendar", "v3", credentials=creds)

                events = (
                    service.events()
                    .list(
                        calendarId="primary",
                        timeMin=now.isoformat(),
                        timeMax=horizon.isoformat(),
                        singleEvents=True,
                    )
                    .execute()
                    .get("items", [])
                )

                for event in events:
                    attendees = [
                        a["email"]
                        for a in event.get("attendees", [])
                        if a["email"] != user.email
                    ]

                    founder_event = FounderEvent(
                        metadata=FounderEventMetadata(
                            user_id=user.id,
                            trace_id=str(uuid.uuid4()),
                            timestamp=datetime.now(timezone.utc),
                        ),
                        task_type=TaskType.ASSISTANT_PREP,
                        payload=FounderEventPayload(
                            source=Source.CALENDAR,
                            content_raw=f"Meeting: {event.get('summary', 'Meeting')}\nAttendees: {', '.join(attendees)}",
                            content_redacted=f"Meeting: {event.get('summary', 'Meeting')}\nAttendees: {', '.join(attendees)}",
                            context_tags=["meeting-prep"],
                            entities=attendees,
                            topic=event.get("summary", "Meeting"),
                        ),
                    )

                    celery_app.send_task(
                        "process_founder_event",
                        args=[founder_event.model_dump(mode="json")],
                        priority=1,
                    )
            except Exception as e:
                print(f"Calendar poll error for user {user.id}: {e}")
