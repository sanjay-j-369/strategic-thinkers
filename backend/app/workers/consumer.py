import os
import uuid
import json
from datetime import datetime, timezone

from app.workers.celery_app import celery_app
from app.schemas.events import FounderEvent, TaskType


@celery_app.task(name="process_founder_event", bind=True)
def process_founder_event(self, event_data: dict):
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

    content_raw = event.payload.content_raw
    content_redacted = strip_pii(content_raw)
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
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    _save_archive(user_id, event.payload.source.value, content_enc, tags)


def _handle_assistant_prep(event: FounderEvent, user_id: str):
    from app.assistant.meeting_prep import generate_prep_card

    card = generate_prep_card(
        user_id=user_id,
        entities=event.payload.entities,
        topic=event.payload.topic or "Meeting",
    )
    _save_summary(user_id, "ASSISTANT_PREP", event.payload.topic, card.get("summary", ""))
    _publish_to_redis(user_id, card)


def _handle_guide_query(event: FounderEvent, user_id: str):
    from app.guide.graph import build_guide_graph

    graph = build_guide_graph()
    result = graph.invoke({
        "user_id": user_id,
        "question": event.payload.topic or event.payload.content_raw,
        "founder_profile": None,
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
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_summary(user_id, "GUIDE_QUERY", result.get("question", ""), result.get("output", ""))
    _publish_to_redis(user_id, card)


def _save_archive(user_id: str, source: str, content_enc: str, tags: list):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.archive import Archive

    try:
        engine = create_engine(os.environ.get("DATABASE_URL", "").replace("+asyncpg", ""))
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


def _save_summary(user_id: str, summary_type: str, topic, summary_text: str):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.summary import Summary

    try:
        engine = create_engine(os.environ.get("DATABASE_URL", "").replace("+asyncpg", ""))
        with Session(engine) as session:
            session.add(Summary(
                user_id=uuid.UUID(user_id),
                type=summary_type,
                topic=topic,
                summary_text=summary_text,
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
