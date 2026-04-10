from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.agentic.assistant.service import run_assistant_cycle
from app.agentic.persistence import save_drafts, save_notification, save_promise_items
from app.assistant.meeting_prep import generate_prep_card
from app.db import build_sync_engine
from app.guide.graph import build_guide_graph
from app.models.archive import Archive
from app.models.base import Base
from app.models.pii_vault import PiiVault
from app.models.summary import Summary
from app.models.user import User
from app.observability import emit_demo_log
from app.pipeline.asymmetric_encryption import encrypt_large_with_public_key
from app.pipeline.embedder import upsert_to_pinecone
from app.pipeline.encryption import encrypt
from app.pipeline.meeting_detector import detect_meeting
from app.pipeline.pii import strip_pii
from app.pipeline.tagger import extract_tags
from app.schemas.events import FounderEvent, TaskType


def process_founder_event_sync(event_data: dict) -> dict:
    event = FounderEvent(**event_data)
    user_id = str(event.metadata.user_id)
    emit_demo_log(
        user_id=user_id,
        message=f"[Ingestion Pipeline] Processing {event.payload.source.value} event {event.metadata.trace_id}.",
        pillar="SYSTEM",
        agent_name="Ingestion Pipeline",
        event_type="pipeline_log",
        step="started",
        details={"task_type": event.task_type.value, "trace_id": event.metadata.trace_id},
    )

    if event.task_type == TaskType.DATA_INGESTION:
        return _handle_data_ingestion(event, user_id)
    if event.task_type == TaskType.ASSISTANT_PREP:
        return _handle_assistant_prep(event, user_id)
    if event.task_type == TaskType.GUIDE_QUERY:
        return _handle_guide_query(event, user_id)
    raise ValueError(f"Unknown task_type: {event.task_type}")


def _handle_data_ingestion(event: FounderEvent, user_id: str) -> dict:
    content_raw = event.payload.content_raw
    emit_demo_log(
        user_id=user_id,
        message="[Ingestion Pipeline] Stripping PII from inbound content.",
        pillar="SYSTEM",
        agent_name="Ingestion Pipeline",
        event_type="pipeline_log",
        step="pii",
        details={"trace_id": event.metadata.trace_id},
    )
    user_public_key = _get_user_public_key(user_id)
    content_redacted, pii_mapping = strip_pii(
        content_raw, user_id, user_public_key=user_public_key
    )
    if user_public_key:
        content_enc = encrypt_large_with_public_key(user_public_key, content_raw)
    else:
        # Legacy compatibility for accounts without client key material.
        content_enc = encrypt(user_id, content_raw)
    tags = event.payload.context_tags or extract_tags(content_redacted)

    emit_demo_log(
        user_id=user_id,
        message="[Ingestion Pipeline] Upserting the redacted content into Pinecone.",
        pillar="SYSTEM",
        agent_name="Ingestion Pipeline",
        event_type="pipeline_log",
        step="vector_store",
        details={"trace_id": event.metadata.trace_id, "tag_count": len(tags)},
    )
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

    pii_tokens = sorted(list(pii_mapping.keys())) if pii_mapping else []
    emit_demo_log(
        user_id=user_id,
        message="[Ingestion Pipeline] Persisting the archive record and PII vault entries.",
        pillar="SYSTEM",
        agent_name="Ingestion Pipeline",
        event_type="pipeline_log",
        step="archive",
        details={"trace_id": event.metadata.trace_id, "pii_token_count": len(pii_tokens)},
    )
    _save_archive(
        user_id=user_id,
        source=event.payload.source.value,
        content_enc=content_enc,
        content_redacted=content_redacted,
        tags=tags,
        pii_tokens=pii_tokens,
    )
    if pii_mapping:
        _save_pii_mapping(
            user_id,
            pii_mapping,
            encryption_scheme="rsa_oaep" if user_public_key else "fernet",
        )

    meeting = detect_meeting(content_redacted, event.payload.source.value)
    if meeting:
        emit_demo_log(
            user_id=user_id,
            message="[Ingestion Pipeline] Meeting signal detected. Generating prep artifacts.",
            pillar="SYSTEM",
            agent_name="Ingestion Pipeline",
            event_type="pipeline_log",
            step="meeting_detection",
            details={"trace_id": event.metadata.trace_id, "topic": meeting.get("topic")},
        )
        _save_meeting_from_detection(user_id, meeting)

    emit_demo_log(
        user_id=user_id,
        message="[Ingestion Pipeline] Handing the updated memory over to the Assistant lane.",
        pillar="SYSTEM",
        agent_name="Ingestion Pipeline",
        event_type="pipeline_log",
        step="assistant_cycle",
        details={"trace_id": event.metadata.trace_id},
    )
    saved_promises: list[dict] = []
    saved_drafts: list[dict] = []
    notifications: list[dict] = []
    try:
        assistant_result = run_assistant_cycle(user_id=user_id, mode="ingestion_watch")
        saved_promises = save_promise_items(user_id, assistant_result.get("promises", []))
        saved_drafts = save_drafts(user_id, assistant_result.get("drafts", []))
        notifications = [
            save_notification(
                user_id=user_id,
                pillar="ASSISTANT",
                agent_name="Chief of Staff",
                notification_type=notification["notification_type"],
                severity=notification["severity"],
                title=notification["title"],
                body=notification["body"],
                payload=notification.get("payload"),
            )
            for notification in assistant_result.get("notifications", [])
        ]
        if not notifications:
            notifications = [
                save_notification(
                    user_id=user_id,
                    pillar="ASSISTANT",
                    agent_name="Chief of Staff",
                    notification_type="INGESTION_WATCH_UPDATE",
                    severity="info",
                    title="New context processed",
                    body="Ingestion completed and founder context has been refreshed.",
                    payload={
                        "trace_id": event.metadata.trace_id,
                        "promise_count": len(saved_promises),
                        "draft_count": len(saved_drafts),
                    },
                )
            ]
    except Exception as exc:
        # Prevent ingestion retries from duplicating archive rows when the
        # assistant lane has an environment/config issue.
        emit_demo_log(
            user_id=user_id,
            message=f"[Ingestion Pipeline] Assistant lane failed: {exc}",
            pillar="SYSTEM",
            agent_name="Ingestion Pipeline",
            event_type="pipeline_log",
            step="assistant_cycle_failed",
            details={"trace_id": event.metadata.trace_id, "error": str(exc)},
        )
        notifications = [
            save_notification(
                user_id=user_id,
                pillar="ASSISTANT",
                agent_name="Chief of Staff",
                notification_type="ASSISTANT_PIPELINE_ERROR",
                severity="warning",
                title="Assistant analysis skipped",
                body="Ingestion completed, but assistant post-processing failed. Check worker logs.",
                payload={"trace_id": event.metadata.trace_id, "error": str(exc)},
            )
        ]
    emit_demo_log(
        user_id=user_id,
        message=(
            f"[Ingestion Pipeline] Completed processing with {len(saved_promises)} promise(s), "
            f"{len(saved_drafts)} draft(s), and {len(notifications)} notification(s)."
        ),
        pillar="SYSTEM",
        agent_name="Ingestion Pipeline",
        event_type="pipeline_log",
        step="completed",
        details={"trace_id": event.metadata.trace_id},
    )
    return {
        "notifications": notifications,
        "promise_count": len(saved_promises),
        "draft_count": len(saved_drafts),
    }


def _handle_assistant_prep(event: FounderEvent, user_id: str) -> dict:
    card = generate_prep_card(
        user_id=user_id,
        entities=event.payload.entities,
        topic=event.payload.topic or "Meeting",
    )
    _save_summary(user_id, "ASSISTANT_PREP", event.payload.topic, card)
    notification = save_notification(
        user_id=user_id,
        pillar="ASSISTANT",
        agent_name="Chief of Staff",
        notification_type="ASSISTANT_PREP",
        severity="info",
        title=f"Prep ready: {event.payload.topic or 'Meeting'}",
        body=card.get("summary", ""),
        payload=card,
    )
    return {"notifications": [notification], "card": card}


def _handle_guide_query(event: FounderEvent, user_id: str) -> dict:
    question = event.payload.topic or event.payload.content_raw
    try:
        graph = build_guide_graph()
        result = graph.invoke(
            {
                "user_id": user_id,
                "question": question,
                "founder_profile": None,
                "communication_style": None,
                "kb_results": None,
                "analysis": None,
                "red_flags": [],
                "output": None,
            }
        )
    except Exception as exc:
        emit_demo_log(
            user_id=user_id,
            message=f"[Ingestion Pipeline] Guide lane failed: {exc}",
            pillar="SYSTEM",
            agent_name="Ingestion Pipeline",
            event_type="pipeline_log",
            step="guide_query_failed",
            details={"trace_id": event.metadata.trace_id, "error": str(exc)},
        )
        result = {
            "question": question,
            "analysis": "Guide analysis could not be generated due to a temporary backend issue.",
            "red_flags": ["Guide lane error"],
            "output": "Retry this guide query after the model/index services recover.",
            "communication_style": "clear and pragmatic",
        }
    card = {
        "type": "GUIDE_QUERY",
        "question": result.get("question", question),
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
    _save_summary(user_id, summary_type, result.get("question", question), card)
    _archive_past_dilemma(
        user_id=user_id,
        question=result.get("question", question),
        output=result.get("output", ""),
        red_flags=result.get("red_flags", []),
    )
    notification = save_notification(
        user_id=user_id,
        pillar="MENTOR",
        agent_name="Guide",
        notification_type=summary_type,
        severity="info",
        title=result.get("question", question or "Strategic guidance ready"),
        body=result.get("output", "")[:400],
        payload=card,
    )
    return {"notifications": [notification], "card": card}


def _save_meeting_from_detection(user_id: str, meeting: dict) -> None:
    engine = build_sync_engine()
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
        session.add(
            Summary(
                user_id=uuid.UUID(user_id),
                type="MEETING",
                topic=meeting.get("topic", "Meeting"),
                summary_text="\n".join(summary_parts),
            )
        )
        session.commit()


def _save_archive(
    user_id: str,
    source: str,
    content_enc: str,
    content_redacted: str,
    tags: list,
    pii_tokens: list[str],
) -> None:
    engine = build_sync_engine()
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(
            Archive(
                user_id=uuid.UUID(user_id),
                source=source,
                content_enc=content_enc,
                content_redacted=content_redacted,
                context_tags=tags,
                pii_tokens=pii_tokens,
            )
        )
        session.commit()


def _save_summary(user_id: str, summary_type: str, topic: str | None, summary_text: str | dict) -> None:
    engine = build_sync_engine()
    Base.metadata.create_all(engine)
    payload = json.dumps(summary_text) if isinstance(summary_text, dict) else str(summary_text)
    with Session(engine) as session:
        session.add(
            Summary(
                user_id=uuid.UUID(user_id),
                type=summary_type,
                topic=topic,
                summary_text=payload,
            )
        )
        session.commit()


def _save_pii_mapping(user_id: str, mapping: dict, encryption_scheme: str) -> None:
    engine = build_sync_engine()
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            for token, enc_val in mapping.items():
                session.add(
                    PiiVault(
                        user_id=uuid.UUID(user_id),
                        token=token,
                        encrypted_value=enc_val,
                        encryption_scheme=encryption_scheme,
                    )
                )
            session.commit()
    except SQLAlchemyError:
        # Legacy schema fallback without pii_vault.encryption_scheme.
        with Session(engine) as session:
            for token, enc_val in mapping.items():
                session.add(
                    PiiVault(
                        user_id=uuid.UUID(user_id),
                        token=token,
                        encrypted_value=enc_val,
                    )
                )
            session.commit()


def _get_user_public_key(user_id: str) -> str | None:
    engine = build_sync_engine()
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            user = session.execute(
                select(User).where(User.id == uuid.UUID(user_id))
            ).scalar_one_or_none()
            if not user:
                return None
            try:
                return user.public_key
            except Exception:
                # Column may not exist yet in legacy schemas.
                return None
    except SQLAlchemyError:
        # Keep ingestion pipeline alive in partially migrated environments.
        return None


def _archive_past_dilemma(user_id: str, question: str, output: str, red_flags: list[str]) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    text = (
        f"Past Dilemma: {question}\n"
        f"Resolution: {output}\n"
        f"Red Flags: {', '.join(red_flags) if red_flags else 'None'}"
    )
    upsert_to_pinecone(
        vector_id=f"dilemma-{uuid.uuid4()}",
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
