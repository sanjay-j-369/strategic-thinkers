from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.models.agent_run import AgentRun
from app.models.worker_agent import WorkerAgent, WorkerStatus
from app.security import require_current_user
from app.services.worker_directory import get_catalog_item, list_catalog_items

router = APIRouter(prefix="/api/workers", tags=["workers"])


class WorkerConfigUpdate(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)


@router.get("")
async def list_workers(request: Request):
    user = await require_current_user(request)
    async_session = request.app.state.async_session

    async with async_session() as session:
        rows = (
            await session.execute(
                select(WorkerAgent).where(WorkerAgent.user_id == user.id)
            )
        ).scalars().all()
        run_rows = (
            await session.execute(
                select(AgentRun)
                .where(AgentRun.user_id == user.id, AgentRun.pillar == "WORKER", AgentRun.status == "RUNNING")
                .order_by(AgentRun.started_at.desc())
            )
        ).scalars().all()

    rows_by_key = {row.worker_key: row for row in rows}
    active_worker_keys = {
        str((row.input_payload or {}).get("worker_key"))
        for row in run_rows
        if isinstance(row.input_payload, dict) and (row.input_payload or {}).get("worker_key")
    }

    items = []
    for item in list_catalog_items():
        row = rows_by_key.get(item.key)
        status = row.status.value if row else WorkerStatus.AVAILABLE.value
        config = {**item.default_config, **((row.config or {}) if row else {})}
        if status == WorkerStatus.PAUSED.value:
            live_status = "Paused"
        elif status == WorkerStatus.HIRED.value:
            live_status = "Processing" if item.key in active_worker_keys else "Active"
        else:
            live_status = "Sleeping"
        items.append(
            {
                "id": item.key,
                "worker_key": item.key,
                "name": item.name,
                "description": item.description,
                "status": status,
                "config": config,
                "security_mode": "vault",
                "live_status": live_status,
                "updated_at": row.updated_at.isoformat() if row else None,
            }
        )

    return {"items": items}


@router.post("/{worker_key}/hire")
async def hire_worker(worker_key: str, request: Request):
    user = await require_current_user(request)
    item = get_catalog_item(worker_key)
    if not item:
        raise HTTPException(status_code=404, detail="Worker not found")

    async_session = request.app.state.async_session
    async with async_session() as session:
        row = (
            await session.execute(
                select(WorkerAgent).where(
                    WorkerAgent.user_id == user.id,
                    WorkerAgent.worker_key == worker_key,
                )
            )
        ).scalar_one_or_none()
        if row:
            row.status = WorkerStatus.HIRED
            row.name = item.name
            row.description = item.description
            row.config = {**item.default_config, **(row.config or {})}
        else:
            row = WorkerAgent(
                user_id=user.id,
                worker_key=item.key,
                name=item.name,
                description=item.description,
                status=WorkerStatus.HIRED,
                config=dict(item.default_config),
            )
            session.add(row)
        await session.commit()
        await session.refresh(row)

    return {
        "id": row.worker_key,
        "worker_key": row.worker_key,
        "name": row.name,
        "description": row.description,
        "status": row.status.value,
        "config": row.config,
        "security_mode": "vault",
        "live_status": "Active",
        "updated_at": row.updated_at.isoformat(),
    }


@router.put("/{worker_key}/config")
async def update_worker_config(worker_key: str, body: WorkerConfigUpdate, request: Request):
    user = await require_current_user(request)
    item = get_catalog_item(worker_key)
    if not item:
        raise HTTPException(status_code=404, detail="Worker not found")

    async_session = request.app.state.async_session
    async with async_session() as session:
        row = (
            await session.execute(
                select(WorkerAgent).where(
                    WorkerAgent.user_id == user.id,
                    WorkerAgent.worker_key == worker_key,
                )
            )
        ).scalar_one_or_none()
        if not row or row.status != WorkerStatus.HIRED:
            raise HTTPException(status_code=400, detail="Worker must be hired before it can be configured")

        row.config = {**item.default_config, **body.config}
        await session.commit()
        await session.refresh(row)

    return {
        "id": row.worker_key,
        "worker_key": row.worker_key,
        "name": row.name,
        "description": row.description,
        "status": row.status.value,
        "config": row.config,
        "security_mode": "vault",
        "live_status": "Active",
        "updated_at": row.updated_at.isoformat(),
    }
