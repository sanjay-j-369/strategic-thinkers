from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import build_sync_engine
from app.models.agent_run import AgentRun
from app.models.archive import Archive
from app.models.startup_profile import StartupProfile
from app.models.user import User


def _pinecone_index():
    from pinecone import Pinecone

    pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    return pc.Index(settings.PINECONE_INDEX)


def list_user_ids() -> list[str]:
    engine = build_sync_engine()
    with Session(engine) as session:
        rows = session.execute(select(User.id)).all()
    return [str(row[0]) for row in rows]


def load_user(user_id: str) -> dict | None:
    engine = build_sync_engine()
    with Session(engine) as session:
        user = session.get(User, uuid.UUID(user_id))
        return user.to_dict() if user else None


def load_startup_profile(user_id: str) -> dict:
    engine = build_sync_engine()
    with Session(engine) as session:
        profile = session.execute(
            select(StartupProfile).where(StartupProfile.user_id == uuid.UUID(user_id))
        ).scalar_one_or_none()
        return profile.to_dict() if profile else {}


def load_last_agent_snapshot(user_id: str, pillar: str, agent_name: str) -> dict:
    engine = build_sync_engine()
    with Session(engine) as session:
        row = session.execute(
            select(AgentRun)
            .where(
                AgentRun.user_id == uuid.UUID(user_id),
                AgentRun.pillar == pillar,
                AgentRun.agent_name == agent_name,
                AgentRun.status == "SUCCEEDED",
            )
            .order_by(AgentRun.completed_at.desc(), AgentRun.started_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        return row.output_payload or {} if row else {}


def recent_archive_items(
    user_id: str,
    *,
    since_hours: int = 24,
    limit: int = 50,
    tag_filter: list[str] | None = None,
    source_filter: list[str] | None = None,
) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    engine = build_sync_engine()
    with Session(engine) as session:
        stmt = (
            select(Archive)
            .where(
                Archive.user_id == uuid.UUID(user_id),
                Archive.ingested_at >= since,
            )
            .order_by(Archive.ingested_at.desc())
            .limit(limit)
        )
        rows = list(session.execute(stmt).scalars().all())

    items = []
    for row in rows:
        tags = row.context_tags or []
        if tag_filter and not any(tag in tags for tag in tag_filter):
            continue
        if source_filter and row.source not in source_filter:
            continue
        items.append(
            {
                "id": str(row.id),
                "source": row.source,
                "text": row.content_redacted or "",
                "context_tags": tags,
                "ingested_at": row.ingested_at.isoformat(),
            }
        )
    return items


def query_memory_by_tags(
    user_id: str,
    *,
    tags: list[str],
    query_text: str,
    since_hours: int = 24,
    top_k: int = 12,
) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    try:
        from app.pipeline.embedder import embed_text

        matches = _pinecone_index().query(
            vector=embed_text(query_text or " ".join(tags)),
            filter={"user_id": user_id, "context_tags": {"$in": tags}},
            top_k=top_k,
            namespace="founder_memory",
            include_metadata=True,
        ).matches
        items = []
        for match in matches:
            metadata = match.metadata or {}
            ingested_at = metadata.get("ingested_at")
            if ingested_at:
                try:
                    if datetime.fromisoformat(ingested_at.replace("Z", "+00:00")) < since:
                        continue
                except Exception:
                    pass
            items.append(
                {
                    "id": match.id,
                    "source": metadata.get("source", "unknown"),
                    "text": metadata.get("text", ""),
                    "context_tags": metadata.get("context_tags", []),
                    "source_url": metadata.get("source_url"),
                    "ingested_at": metadata.get("ingested_at"),
                    "score": float(match.score or 0.0),
                }
            )
        if items:
            return items
    except Exception:
        pass

    return recent_archive_items(user_id, since_hours=since_hours, limit=top_k * 2, tag_filter=tags)[:top_k]
