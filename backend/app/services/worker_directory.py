from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import build_sync_engine
from app.models.worker_agent import WorkerAgent, WorkerStatus


@dataclass(frozen=True)
class WorkerCatalogItem:
    key: str
    name: str
    description: str
    lane: str
    tags: tuple[str, ...]
    default_config: dict[str, Any]


WORKER_CATALOG: tuple[WorkerCatalogItem, ...] = (
    WorkerCatalogItem(
        key="gtm-agent",
        name="GTM Agent",
        description="Monitors sales and customer signals and prepares founder-reviewed follow-ups inside the encrypted workspace.",
        lane="gtm",
        tags=("customer", "support", "gtm", "slack", "email", "revenue"),
        default_config={
            "monitor_targets": "#sales,#customers,investors",
            "auto_draft_replies": True,
            "custom_instructions": "Prioritize revenue-moving follow-ups, churn risk, investor asks, and stalled pipeline conversations.",
        },
    ),
)

_CATALOG_BY_KEY = {item.key: item for item in WORKER_CATALOG}


def list_catalog_items() -> list[WorkerCatalogItem]:
    return list(WORKER_CATALOG)


def get_catalog_item(worker_key: str) -> WorkerCatalogItem | None:
    return _CATALOG_BY_KEY.get(worker_key)


def list_hired_user_ids_for_worker(worker_key: str) -> list[str]:
    engine = build_sync_engine()
    with Session(engine) as session:
        rows = session.execute(
            select(WorkerAgent.user_id).where(
                WorkerAgent.worker_key == worker_key,
                WorkerAgent.status == WorkerStatus.HIRED,
            )
        ).all()
    return [str(user_id) for (user_id,) in rows]


def get_worker_runtime(worker_key: str, *, config: dict[str, Any] | None = None) -> dict[str, Any]:
    item = get_catalog_item(worker_key)
    if not item:
        raise KeyError(worker_key)

    active_config = {**item.default_config, **(config or {})}
    return {
        "worker_key": item.key,
        "worker_name": item.name,
        "lane": item.lane,
        "tags": list(item.tags),
        "config": active_config,
    }


def load_hired_worker_runtime(user_id: str, worker_key: str) -> dict[str, Any] | None:
    item = get_catalog_item(worker_key)
    if not item:
        return None

    engine = build_sync_engine()
    with Session(engine) as session:
        row = session.execute(
            select(WorkerAgent).where(
                WorkerAgent.user_id == uuid.UUID(user_id),
                WorkerAgent.worker_key == worker_key,
                WorkerAgent.status == WorkerStatus.HIRED,
            )
        ).scalar_one_or_none()
        if not row:
            return None
        return get_worker_runtime(worker_key, config=row.config or {})
