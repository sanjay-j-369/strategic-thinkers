from pydantic import BaseModel
from uuid import UUID
from enum import Enum
from typing import Optional
from datetime import datetime


class TaskType(str, Enum):
    ASSISTANT_PREP = "ASSISTANT_PREP"
    GUIDE_QUERY = "GUIDE_QUERY"
    DATA_INGESTION = "DATA_INGESTION"


class Source(str, Enum):
    GMAIL = "GMAIL"
    SLACK = "SLACK"
    CALENDAR = "CALENDAR"
    MEET_TRANSCRIPT = "MEET_TRANSCRIPT"


class FounderEventMetadata(BaseModel):
    user_id: UUID
    trace_id: str
    timestamp: datetime


class FounderEventPayload(BaseModel):
    source: Source
    content_raw: str
    content_redacted: str
    context_tags: list[str]
    entities: list[str] = []
    topic: Optional[str] = None
    source_id: Optional[str] = None
    source_url: Optional[str] = None
    is_action_item: bool = False


class FounderEvent(BaseModel):
    metadata: FounderEventMetadata
    task_type: TaskType
    payload: FounderEventPayload
