from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import build_sync_engine
from app.models.agent_notification import AgentNotification
from app.models.agent_run import AgentRun
from app.models.draft_reply import DraftReply
from app.models.promise_item import PromiseItem


def start_agent_run(
    *,
    user_id: str | None,
    pillar: str,
    agent_name: str,
    trigger_type: str,
    input_payload: dict | None,
) -> str:
    engine = build_sync_engine()
    with Session(engine) as session:
        row = AgentRun(
            user_id=uuid.UUID(user_id) if user_id else None,
            pillar=pillar,
            agent_name=agent_name,
            trigger_type=trigger_type,
            status="RUNNING",
            input_payload=input_payload,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return str(row.id)


def finish_agent_run(run_id: str, *, status: str, output_payload: dict | None = None, error_text: str | None = None) -> None:
    engine = build_sync_engine()
    with Session(engine) as session:
        row = session.get(AgentRun, uuid.UUID(run_id))
        if not row:
            return
        row.status = status
        row.output_payload = output_payload
        row.error_text = error_text
        row.completed_at = datetime.now(timezone.utc)
        session.commit()


def save_notification(
    *,
    user_id: str,
    pillar: str,
    agent_name: str,
    notification_type: str,
    severity: str,
    title: str,
    body: str,
    payload: dict | None = None,
) -> dict:
    engine = build_sync_engine()
    with Session(engine) as session:
        row = AgentNotification(
            user_id=uuid.UUID(user_id),
            pillar=pillar,
            agent_name=agent_name,
            notification_type=notification_type,
            severity=severity,
            title=title,
            body=body,
            payload=payload,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return {
            "id": str(row.id),
            "pillar": row.pillar,
            "agent_name": row.agent_name,
            "notification_type": row.notification_type,
            "severity": row.severity,
            "title": row.title,
            "body": row.body,
            "payload": row.payload,
            "created_at": row.created_at.isoformat(),
        }


def save_promise_items(user_id: str, items: list[dict]) -> list[dict]:
    engine = build_sync_engine()
    saved: list[dict] = []
    with Session(engine) as session:
        for item in items:
            existing = session.execute(
                select(PromiseItem).where(
                    PromiseItem.user_id == uuid.UUID(user_id),
                    PromiseItem.source_ref == item.get("source_ref"),
                    PromiseItem.promise_text == item.get("promise_text"),
                    PromiseItem.status == "OPEN",
                )
            ).scalar_one_or_none()
            if existing:
                saved.append(
                    {
                        "id": str(existing.id),
                        "promise_text": existing.promise_text,
                        "status": existing.status,
                    }
                )
                continue
            row = PromiseItem(
                user_id=uuid.UUID(user_id),
                source_ref=item.get("source_ref"),
                promise_text=item.get("promise_text", ""),
                promised_by=item.get("promised_by"),
                confidence=float(item.get("confidence", 0.5)),
                context_payload=item.get("context_payload"),
            )
            session.add(row)
            session.flush()
            saved.append(
                {
                    "id": str(row.id),
                    "promise_text": row.promise_text,
                    "status": row.status,
                }
            )
        session.commit()
    return saved


def save_drafts(user_id: str, drafts: list[dict]) -> list[dict]:
    engine = build_sync_engine()
    saved: list[dict] = []
    with Session(engine) as session:
        for draft in drafts:
            existing = session.execute(
                select(DraftReply).where(
                    DraftReply.user_id == uuid.UUID(user_id),
                    DraftReply.source_ref == draft.get("source_ref"),
                    DraftReply.status == "DRAFT",
                )
            ).scalar_one_or_none()
            if existing:
                saved.append(
                    {
                        "id": str(existing.id),
                        "channel": existing.channel,
                        "draft_text": existing.draft_text,
                    }
                )
                continue
            row = DraftReply(
                user_id=uuid.UUID(user_id),
                source_ref=draft.get("source_ref"),
                channel=draft.get("channel", "email"),
                prompt=draft.get("prompt", ""),
                draft_text=draft.get("draft_text", ""),
                context_payload=draft.get("context_payload"),
            )
            session.add(row)
            session.flush()
            saved.append(
                {
                    "id": str(row.id),
                    "channel": row.channel,
                    "draft_text": row.draft_text,
                }
            )
        session.commit()
    return saved
