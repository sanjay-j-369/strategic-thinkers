# 04 — The Assistant: Meeting Prep RAG

The Assistant is a **Time-Triggered RAG** flow. It doesn't wait for the founder to ask — it proactively pushes a briefing card before every external meeting.

---

## End-to-End Flow

```
Celery Beat (every 15 min)
        │
        ▼
poll_calendar_events  (real) | poll_calendar_simulated  (simulator)
        │
        │  Finds a meeting starting in T−30 min
        │
        ▼
Enqueue FounderEvent (task_type=ASSISTANT_PREP, priority=1)
        │
        ▼
consumer.py  ──►  meeting_prep.generate_prep_card()
        │
        │  Dual-filter Pinecone query
        │
        ├──► Filter A: recent messages involving attendee emails
        └──► Filter B: semantic search for meeting topic
        │
        ▼
Deduplicate + rank snippets
        │
        ▼
GPT-4o synthesis prompt
        │
        ▼
Save summary → Postgres (summary table)
        │
        ▼
Push card via WebSocket → Next.js dashboard
```

---

## The Celery Beat Trigger

**File:** `backend/app/ingestion/calendar.py`

```python
from celery.schedules import crontab
from datetime import datetime, timezone, timedelta

# Fires every 15 minutes
@celery_app.task(name="poll_calendar_events")
def poll_calendar_events():
    now     = datetime.now(timezone.utc)
    horizon = now + timedelta(minutes=30)

    for user in User.get_all_with_google_token():
        creds   = user.get_google_credentials()
        service = build("calendar", "v3", credentials=creds)

        events = service.events().list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=horizon.isoformat(),
            singleEvents=True,
        ).execute().get("items", [])

        for event in events:
            attendees = [a["email"] for a in event.get("attendees", [])
                         if a["email"] != user.email]

            # Push high-priority task to the queue
            process_founder_event.apply_async(
                args=[FounderEvent(
                    task_type=TaskType.ASSISTANT_PREP,
                    payload={
                        "source":       Source.CALENDAR,
                        "context_tags": ["meeting-prep"],
                        "entities":     attendees,
                        "topic":        event.get("summary", "Meeting"),
                    }
                ).dict()],
                priority=1,
            )
```

---

## The RAG Retrieval Step

**File:** `backend/app/assistant/meeting_prep.py`

Two simultaneous Pinecone queries are run against the `founder_memory` namespace:

```python
def generate_prep_card(user_id: str, entities: list[str], topic: str) -> dict:
    index = pinecone.Index(os.environ["PINECONE_INDEX"])
    topic_vec = _embed(topic)

    # Filter A — messages involving these specific people
    entity_results = index.query(
        vector=topic_vec,
        filter={"user_id": user_id, "entities": {"$in": entities}},
        top_k=10,
        namespace="founder_memory",
        include_metadata=True,
    )

    # Filter B — internal discussions about this topic
    topic_results = index.query(
        vector=topic_vec,
        filter={"user_id": user_id},
        top_k=10,
        namespace="founder_memory",
        include_metadata=True,
    )

    snippets = _deduplicate(entity_results.matches + topic_results.matches)
    context  = "\n---\n".join([m.metadata.get("text", "") for m in snippets])
    ...
```

---

## The Synthesis Prompt

```
You are an executive assistant.
Review these redacted snippets from the last 7 days.

Summarize:
1. The last thing we promised them.
2. Any 'hot' friction points.
3. The suggested goal for this 30-min call.

CONTEXT:
{context}

MEETING TOPIC: {topic}
PARTICIPANTS: {', '.join(entities)}
```

**Model:** `gpt-4o`  
**Temperature:** `0.3` (factual, not creative)

---

## Output — Prep Card

```json
{
  "type":         "ASSISTANT_PREP",
  "topic":        "Q2 Roadmap Review",
  "summary":      "1. Last promised: API rate limit fix by Friday...\n2. Hot friction: 429 errors still in prod...\n3. Goal: align on timeline and ship date.",
  "generated_at": "2024-05-20T09:30:00Z"
}
```

This is saved to Postgres `summary` table and pushed via WebSocket to the Next.js feed, where it renders as an amber-accented **PrepCard** component.

---

## Timing Budget

| Step | Target Latency |
|------|---------------|
| Calendar poll → queue | < 1 s |
| Queue → Pinecone retrieval | < 2 s |
| GPT-4o synthesis | < 8 s |
| WebSocket push to UI | < 200 ms |
| **Total: queue pickup → card on screen** | **< 12 s** |

The card should appear on the founder's screen ~12 seconds after the Celery Beat fires — well within the 30-minute window.
