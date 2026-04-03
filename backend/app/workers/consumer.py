import os
import uuid
import json
from datetime import datetime, timezone

from app.workers.celery_app import celery_app
from app.schemas.events import FounderEvent, TaskType


@celery_app.task(name="process_founder_event", bind=True)
def process_founder_event(self, event_data: dict):
    """
    Main worker: routes on task_type.
    - DATA_INGESTION: strip_pii -> encrypt -> embed -> upsert pinecone -> save archive
    - ASSISTANT_PREP: generate_prep_card -> save summary -> publish to redis pubsub
    - GUIDE_QUERY: run guide graph -> publish to redis pubsub
    """
    event = FounderEvent(**event_data)
    user_id = str(event.metadata.user_id)
    task_type = event.task_type

    if task_type == TaskType.DATA_INGESTION:
        _handle_data_ingestion(event, user_id)
    elif task_type == TaskType.ASSISTANT_PREP:
        _handle_assistant_prep(event, user_id)
    elif task_type == TaskType.GUIDE_QUERY:
        _handle_guide_query(event, user_id)
    else:
        raise ValueError(f"Unknown task_type: {task_type}")


def _handle_data_ingestion(event: FounderEvent, user_id: str):
    from app.pipeline.pii import strip_pii
    from app.pipeline.encryption import encrypt
    from app.pipeline.embedder import upsert_to_pinecone
    from app.pipeline.tagger import extract_tags
    from app.pipeline.meeting_detector import detect_meeting

    content_raw = event.payload.content_raw
    content_redacted, pii_mapping = strip_pii(content_raw, user_id)
    content_enc = encrypt(user_id, content_raw)
    tags = event.payload.context_tags or extract_tags(content_redacted)

    upsert_to_pinecone(
        vector_id=event.metadata.trace_id,
        text=content_redacted,
        namespace="founder_memory",
        metadata={
            "user_id": user_id,
            "source": event.payload.source.value,
            "text": content_redacted,
            "entities": event.payload.entities,
            "context_tags": tags,
            "topic": event.payload.topic or "",
            "source_id": event.payload.source_id or "",
            "source_url": event.payload.source_url or "",
            "is_action_item": bool(event.payload.is_action_item),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    _save_archive(user_id, event.payload.source.value, content_enc, tags)
    
    if pii_mapping:
        _save_pii_mapping(user_id, pii_mapping)

    # LLM-powered meeting detection
    meeting = detect_meeting(content_raw, event.payload.source.value)
    if meeting:
        _save_meeting_from_detection(user_id, meeting)
        print(f"[Consumer] Meeting detected: {meeting.get('topic')}")



def _handle_assistant_prep(event: FounderEvent, user_id: str):
    from app.assistant.meeting_prep import generate_prep_card

    card = generate_prep_card(
        user_id=user_id,
        entities=event.payload.entities,
        topic=event.payload.topic or "Meeting",
    )
    _save_summary(user_id, "ASSISTANT_PREP", event.payload.topic, card)
    _publish_to_redis(user_id, card)


def _handle_guide_query(event: FounderEvent, user_id: str):
    from app.guide.graph import build_guide_graph

    graph = build_guide_graph()
    result = graph.invoke({
        "user_id": user_id,
        "question": event.payload.topic or event.payload.content_raw,
        "founder_profile": None,
        "communication_style": None,
        "kb_results": None,
        "analysis": None,
        "red_flags": [],
        "output": None,
    })

    card = {
        "type": "GUIDE_QUERY",
        "question": result.get("question", ""),
        "analysis": result.get("analysis", ""),
        "red_flags": result.get("red_flags", []),
        "output": result.get("output", ""),
        "communication_style": result.get("communication_style", ""),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    summary_type = (
        "GUIDE_MILESTONE"
        if "milestone-trigger" in (event.payload.context_tags or [])
        else "GUIDE_QUERY"
    )
    _save_summary(user_id, summary_type, result.get("question", ""), card)
    _archive_past_dilemma(
        user_id=user_id,
        question=result.get("question", ""),
        output=result.get("output", ""),
        red_flags=result.get("red_flags", []),
    )
    _publish_to_redis(user_id, card)


def _save_meeting_from_detection(user_id: str, meeting: dict):
    """Save LLM-detected meeting to DB."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.base import Base
    from app.models.user import User
    from app.models.summary import Summary
    from datetime import datetime, timezone

    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    try:
        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        attendees = ", ".join(meeting.get("attendees") or [])
        meet_link = meeting.get("meet_link") or ""
        scheduled = meeting.get("scheduled_time") or datetime.now(timezone.utc).isoformat()
        summary_parts = [
            f"Attendees: {attendees}",
            f"Scheduled: {scheduled}",
            f"Summary: {meeting.get('summary', '')}",
        ]
        if meet_link:
            summary_parts.append(f"Meet Link: {meet_link}")

        with Session(engine) as session:
            session.add(Summary(
                user_id=uuid.UUID(user_id),
                type="MEETING",
                topic=meeting.get("topic", "Meeting"),
                summary_text="\n".join(summary_parts),
            ))
            session.commit()
    except Exception as e:
        print(f"Meeting detection save error: {e}")


def _save_archive(user_id: str, source: str, content_enc: str, tags: list):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.base import Base
    from app.models.user import User  # must import User first so FK resolves
    from app.models.archive import Archive

    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    try:
        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            session.add(Archive(
                user_id=uuid.UUID(user_id),
                source=source,
                content_enc=content_enc,
                context_tags=tags,
            ))
            session.commit()
    except Exception as e:
        print(f"Archive save error: {e}")


def _save_summary(user_id: str, summary_type: str, topic: str | None, summary_text: str | dict):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.summary import Summary
    from app.models.base import Base

    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    try:
        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        payload = summary_text
        if isinstance(summary_text, dict):
            payload = json.dumps(summary_text)
        with Session(engine) as session:
            session.add(Summary(
                user_id=uuid.UUID(user_id),
                type=summary_type,
                topic=topic,
                summary_text=str(payload),
            ))
            session.commit()
    except Exception as e:
        print(f"Summary save error: {e}")


def _publish_to_redis(user_id: str, card: dict):
    try:
        import redis
        r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
        r.publish(f"founder:{user_id}", json.dumps(card))
    except Exception as e:
        print(f"Redis publish error: {e}")


def _save_pii_mapping(user_id: str, mapping: dict):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.base import Base
    from app.models.pii_vault import PiiVault
    import uuid
    import os

    db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
    try:
        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            for token, enc_val in mapping.items():
                session.add(PiiVault(
                    user_id=uuid.UUID(user_id),
                    token=token,
                    encrypted_value=enc_val
                ))
            session.commit()
    except Exception as e:
        print(f"PiiVault save error: {e}")


def _archive_past_dilemma(user_id: str, question: str, output: str, red_flags: list[str]):
    from app.pipeline.embedder import upsert_to_pinecone

    timestamp = datetime.now(timezone.utc).isoformat()
    text = (
        f"Past Dilemma: {question}\n"
        f"Resolution: {output}\n"
        f"Red Flags: {', '.join(red_flags) if red_flags else 'None'}"
    )
    vector_id = f"dilemma-{uuid.uuid4()}"
    upsert_to_pinecone(
        vector_id=vector_id,
        text=text,
        namespace="founder_memory",
        metadata={
            "user_id": user_id,
            "source": "GUIDE_QUERY",
            "text": text,
            "context_tags": ["past-dilemma", "guide-query"],
            "topic": question,
            "is_action_item": False,
            "ingested_at": timestamp,
        },
    )
