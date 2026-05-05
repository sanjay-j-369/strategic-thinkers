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
        description="Monitors revenue, sales pipeline, customer expansion, churn risk, and customer-facing escalations. Prepares founder-reviewed GTM reports and follow-ups.",
        lane="gtm",
        tags=("gtm", "customer", "revenue", "sales", "pipeline", "churn", "renewal", "expansion", "billing"),
        default_config={
            "monitor_targets": "#sales,#customers,#support-escalations,enterprise accounts",
            "auto_draft_replies": True,
            "custom_instructions": (
                "Stay strictly in GTM scope: pipeline, revenue, customers, renewals, expansion, churn, and "
                "customer-facing incidents. Exclude hiring, recruiting, engineering-only incidents, and internal staffing decisions unless they directly affect a customer or revenue commitment."
            ),
        },
    ),
    WorkerCatalogItem(
        key="hiring-agent",
        name="Hiring Agent",
        description="Tracks recruiting pipelines and candidate communications. Prepares interview briefs and follow-up drafts for hiring managers.",
        lane="hiring",
        tags=("recruiting", "hr", "hiring", "candidates", "interviews"),
        default_config={
            "monitor_targets": "#hiring,#recruiting,#candidates",
            "auto_draft_replies": False,
            "custom_instructions": "Focus on candidate experience, interview scheduling, and offer follow-ups. Flag delayed hiring pipelines.",
        },
    ),
    WorkerCatalogItem(
        key="finance-agent",
        name="Finance Agent",
        description="Monitors burn rate, runway signals, and financial communications. Flags concerning patterns and prepares financial summaries.",
        lane="finance",
        tags=("finance", "burn-rate", "runway", "budget", "metrics"),
        default_config={
            "monitor_targets": "#finance,#budget,invoices",
            "auto_draft_replies": False,
            "custom_instructions": "Track burn rate changes, invoice delays, and investor updates. Alert on runway concerns.",
        },
    ),
    WorkerCatalogItem(
        key="product-agent",
        name="Product Agent",
        description="Surfaces user feedback, feature requests, and product insights. Prepares synthesis of user sentiment for roadmap planning.",
        lane="product",
        tags=("product", "feedback", "users", "features", "roadmap"),
        default_config={
            "monitor_targets": "#product,#feedback,#feature-requests",
            "auto_draft_replies": False,
            "custom_instructions": "Synthesize user feedback themes, flag urgent feature requests, and track competitive signals.",
        },
    ),
    WorkerCatalogItem(
        key="compliance-agent",
        name="Compliance Agent",
        description="Monitors legal and compliance communications. Tracks contract renewals, NDAs, and regulatory deadlines.",
        lane="compliance",
        tags=("legal", "compliance", "contracts", "nda", "regulatory"),
        default_config={
            "monitor_targets": "#legal,#compliance,contracts",
            "auto_draft_replies": False,
            "custom_instructions": "Track contract deadlines, NDA expirations, and compliance requirements. Flag items needing legal review.",
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
