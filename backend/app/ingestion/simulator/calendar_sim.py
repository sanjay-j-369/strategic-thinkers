import uuid
import random
from datetime import datetime, timezone

from app.runtime.queue import enqueue_task_sync
from app.runtime.task_names import TaskNames
from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, TaskType, Source
from app.ingestion.simulator.fixtures import FAKE_MEETINGS
from app.ingestion.simulator.config import SIM_CONFIG


def poll_calendar_simulated(user_id: str | None = None):
    """Emit a fake ASSISTANT_PREP event simulating an upcoming meeting."""
    uid = user_id or str(uuid.uuid4())
    meeting = random.choice(FAKE_MEETINGS)

    event = FounderEvent(
        metadata=FounderEventMetadata(
            user_id=uuid.UUID(uid) if isinstance(uid, str) else uid,
            trace_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
        ),
        task_type=TaskType.ASSISTANT_PREP,
        payload=FounderEventPayload(
            source=Source.CALENDAR,
            content_raw=f"Meeting: {meeting['summary']}\nAttendees: {', '.join(meeting['attendees'])}",
            content_redacted=f"Meeting: {meeting['summary']}\nAttendees: {', '.join(meeting['attendees'])}",
            context_tags=["meeting-prep"],
            entities=meeting["attendees"],
            topic=meeting["summary"],
            source_id=f"calendar:{meeting['summary']}",
        ),
    )

    enqueue_task_sync(
        TaskNames.FOUNDER_EVENT,
        {"event": event.model_dump(mode="json")},
        priority=1,
    )
    return event.model_dump(mode="json")
