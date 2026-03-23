# 02 — Data Schema (The Queue Contract)

Every event that enters the Redis queue **must** conform to the `FounderEvent` schema. This is the "single truth" that lets the worker not care whether data came from Gmail, Slack, or a fake simulator.

---

## FounderEvent JSON Shape

```json
{
  "metadata": {
    "user_id":   "uuid-123",
    "trace_id":  "unique-celery-task-id",
    "timestamp": "2024-05-20T10:00:00Z"
  },
  "task_type": "ASSISTANT_PREP | GUIDE_QUERY | DATA_INGESTION",
  "payload": {
    "source":           "GMAIL | SLACK | CALENDAR | MEET_TRANSCRIPT",
    "content_raw":      "...",   // Encrypted with Fernet before Postgres storage
    "content_redacted": "...",   // PII-stripped; used for ALL AI reasoning
    "context_tags":     ["hiring", "investor", "gtm"],
    "entities":         ["external_person@client.com"],
    "topic":            "Q2 Roadmap Review"   // optional
  }
}
```

---

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metadata.user_id` | UUID | ✅ | Founder's auth ID |
| `metadata.trace_id` | String | ✅ | Unique task ID for logging/debugging |
| `metadata.timestamp` | ISO 8601 | ✅ | Event creation time (UTC) |
| `task_type` | Enum | ✅ | Routes to the correct worker sub-pipeline |
| `payload.source` | Enum | ✅ | Original data source |
| `payload.content_raw` | String | ✅ | Full original text (encrypted at rest) |
| `payload.content_redacted` | String | ✅ (or empty) | PII-stripped text used for AI |
| `payload.context_tags` | String[] | ✅ | Semantic tags for filtering/retrieval |
| `payload.entities` | String[] | ❌ | Email addresses / Slack user IDs involved |
| `payload.topic` | String | ❌ | Meeting subject or email subject line |

---

## Task Type → Pipeline Routing

```
task_type = DATA_INGESTION
  └─► strip PII → encrypt raw → embed redacted → upsert Pinecone → archive Postgres

task_type = ASSISTANT_PREP
  └─► dual-filter Pinecone query (entities + topic) → GPT-4o synthesis → WebSocket push

task_type = GUIDE_QUERY
  └─► LangGraph reasoning loop (4 nodes) → WebSocket push
```

---

## Priority Lanes

| Priority | task_type | Reason |
|----------|-----------|--------|
| `1` (high) | `ASSISTANT_PREP` | Meeting starts in ≤ 30 min — time critical |
| `2` (normal) | `DATA_INGESTION`, `GUIDE_QUERY` | Background, can queue |

---

## Pydantic Model (Python)

```python
# backend/app/schemas/events.py

from pydantic import BaseModel, UUID4
from enum import Enum
from typing import Optional
from datetime import datetime

class TaskType(str, Enum):
    ASSISTANT_PREP  = "ASSISTANT_PREP"
    GUIDE_QUERY     = "GUIDE_QUERY"
    DATA_INGESTION  = "DATA_INGESTION"

class Source(str, Enum):
    GMAIL           = "GMAIL"
    SLACK           = "SLACK"
    CALENDAR        = "CALENDAR"
    MEET_TRANSCRIPT = "MEET_TRANSCRIPT"

class FounderEventMetadata(BaseModel):
    user_id:   UUID4
    trace_id:  str
    timestamp: datetime

class FounderEventPayload(BaseModel):
    source:           Source
    content_raw:      str
    content_redacted: str
    context_tags:     list[str]
    entities:         list[str] = []
    topic:            Optional[str] = None

class FounderEvent(BaseModel):
    metadata:  FounderEventMetadata
    task_type: TaskType
    payload:   FounderEventPayload
```

---

## Adding a New Source (e.g. Zoom, LinkedIn)

1. Add a new value to the `Source` enum: `ZOOM_TRANSCRIPT = "ZOOM_TRANSCRIPT"`
2. Create `backend/app/ingestion/zoom.py` that maps Zoom webhook payload → `FounderEvent`
3. That's it — the worker and all downstream AI logic needs no changes
