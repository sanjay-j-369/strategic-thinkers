from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, select

from app.api.ws import manager
from app.config import settings
from app.models.agent_notification import AgentNotification
from app.models.agent_run import AgentRun
from app.models.draft_reply import DraftReply
from app.models.promise_item import PromiseItem
from app.models.task_queue import TaskQueue
from app.security import resolve_user

router = APIRouter(prefix="/api/ops", tags=["ops"])


@router.get("/notifications")
async def list_notifications(
    request: Request,
    user_id: str | None = Query(None),
    limit: int = Query(30, le=100),
    offset: int = Query(0),
    pillar: str | None = Query(None),
    unread_only: bool = Query(False),
):
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        stmt = (
            select(AgentNotification)
            .where(AgentNotification.user_id == user.id)
            .order_by(AgentNotification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if pillar:
            stmt = stmt.where(AgentNotification.pillar == pillar.upper())
        if unread_only:
            stmt = stmt.where(AgentNotification.read_at.is_(None))

        items = (await session.execute(stmt)).scalars().all()
        total_stmt = select(func.count()).select_from(AgentNotification).where(
            AgentNotification.user_id == user.id
        )
        if pillar:
            total_stmt = total_stmt.where(AgentNotification.pillar == pillar.upper())
        if unread_only:
            total_stmt = total_stmt.where(AgentNotification.read_at.is_(None))
        total = await session.scalar(total_stmt)

    return {
        "items": [
            {
                "id": str(item.id),
                "pillar": item.pillar,
                "agent_name": item.agent_name,
                "notification_type": item.notification_type,
                "severity": item.severity,
                "title": item.title,
                "body": item.body,
                "payload": item.payload,
                "read_at": item.read_at.isoformat() if item.read_at else None,
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ],
        "total": total or 0,
    }


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    request: Request,
    user_id: str | None = Query(None),
):
    from datetime import datetime, timezone

    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(AgentNotification).where(
                AgentNotification.id == notification_id,
                AgentNotification.user_id == user.id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Notification not found")
        item.read_at = datetime.now(timezone.utc)
        await session.commit()

    return {"status": "read", "id": notification_id}


@router.get("/promises")
async def list_promises(
    request: Request,
    user_id: str | None = Query(None),
    limit: int = Query(40, le=100),
    status: str | None = Query("OPEN"),
):
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        stmt = (
            select(PromiseItem)
            .where(PromiseItem.user_id == user.id)
            .order_by(PromiseItem.created_at.desc())
            .limit(limit)
        )
        if status:
            stmt = stmt.where(PromiseItem.status == status.upper())
        items = (await session.execute(stmt)).scalars().all()

    return {
        "items": [
            {
                "id": str(item.id),
                "promise_text": item.promise_text,
                "status": item.status,
                "confidence": item.confidence,
                "source_ref": item.source_ref,
                "promised_by": item.promised_by,
                "due_at": item.due_at.isoformat() if item.due_at else None,
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ]
    }


@router.get("/drafts")
async def list_drafts(
    request: Request,
    user_id: str | None = Query(None),
    limit: int = Query(20, le=100),
    status: str | None = Query("DRAFT"),
):
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        stmt = (
            select(DraftReply)
            .where(DraftReply.user_id == user.id)
            .order_by(DraftReply.created_at.desc())
            .limit(limit)
        )
        if status:
            stmt = stmt.where(DraftReply.status == status.upper())
        items = (await session.execute(stmt)).scalars().all()

    return {
        "items": [
            {
                "id": str(item.id),
                "source_ref": item.source_ref,
                "channel": item.channel,
                "status": item.status,
                "prompt": item.prompt,
                "draft_text": item.draft_text,
                "context_payload": item.context_payload,
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ]
    }


@router.get("/runs")
async def list_agent_runs(
    request: Request,
    user_id: str | None = Query(None),
    limit: int = Query(30, le=100),
    pillar: str | None = Query(None),
):
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        stmt = (
            select(AgentRun)
            .where(AgentRun.user_id == user.id)
            .order_by(AgentRun.started_at.desc())
            .limit(limit)
        )
        if pillar:
            stmt = stmt.where(AgentRun.pillar == pillar.upper())
        items = (await session.execute(stmt)).scalars().all()

    return {
        "items": [
            {
                "id": str(item.id),
                "pillar": item.pillar,
                "agent_name": item.agent_name,
                "trigger_type": item.trigger_type,
                "status": item.status,
                "input_payload": item.input_payload,
                "output_payload": item.output_payload,
                "error_text": item.error_text,
                "started_at": item.started_at.isoformat(),
                "completed_at": item.completed_at.isoformat() if item.completed_at else None,
            }
            for item in items
        ]
    }


@router.get("/system-status")
async def system_status(
    request: Request,
    user_id: str | None = Query(None),
):
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    runner_task = getattr(request.app.state.task_runner, "_task", None)
    runner_running = bool(runner_task and not runner_task.done())

    async with async_session() as session:
        queue_rows = (
            await session.execute(
                select(TaskQueue).order_by(TaskQueue.created_at.desc()).limit(200)
            )
        ).scalars().all()
        run_rows = (
            await session.execute(
                select(AgentRun)
                .where(AgentRun.user_id == user.id)
                .order_by(AgentRun.started_at.desc())
                .limit(50)
            )
        ).scalars().all()

    queue_counts = {"pending": 0, "running": 0, "failed": 0}
    user_queue_counts = {"pending": 0, "running": 0}
    task_counts: dict[str, int] = {}
    active_ingestions: list[dict] = []

    for row in queue_rows:
        status = (row.status or "").lower()
        if status in queue_counts:
            queue_counts[status] += 1
        task_counts[row.task_name] = task_counts.get(row.task_name, 0) + 1

        row_user_id = _extract_task_user_id(row.payload or {})
        is_user_task = row_user_id == str(user.id)
        if is_user_task and status in user_queue_counts:
            user_queue_counts[status] += 1

        if (
            is_user_task
            and row.task_name == "founder_event.process"
            and status in {"pending", "running"}
        ):
            active_ingestions.append(_serialize_ingestion_task(row))

    active_runs = [row for row in run_rows if row.status == "RUNNING"]
    runs_by_pillar: dict[str, int] = {}
    for row in active_runs:
        runs_by_pillar[row.pillar] = runs_by_pillar.get(row.pillar, 0) + 1

    return {
        "runner": {
            "status": "running" if runner_running else "stopped",
            "active_runners": 1 if runner_running else 0,
            "poll_interval_seconds": settings.POSTGRES_QUEUE_POLL_INTERVAL_SECONDS,
        },
        "websocket": {
            "user_connections": len(manager.active_connections.get(str(user.id), set())),
            "admin_connections": len(manager.admin_connections),
        },
        "queue": {
            "counts": queue_counts,
            "user_counts": user_queue_counts,
            "by_task_name": task_counts,
        },
        "workers": {
            "active_runs": len(active_runs),
            "by_pillar": runs_by_pillar,
        },
        "active_ingestions": active_ingestions[:8],
    }


def _extract_task_user_id(payload: dict) -> str | None:
    if not isinstance(payload, dict):
        return None
    direct = payload.get("user_id")
    if direct is not None:
        return str(direct)
    event = payload.get("event")
    if isinstance(event, dict):
        metadata = event.get("metadata")
        if isinstance(metadata, dict) and metadata.get("user_id") is not None:
            return str(metadata.get("user_id"))
    return None


def _serialize_ingestion_task(row: TaskQueue) -> dict:
    payload = row.payload or {}
    event = payload.get("event") if isinstance(payload, dict) else {}
    metadata = event.get("metadata") if isinstance(event, dict) else {}
    event_payload = event.get("payload") if isinstance(event, dict) else {}
    content_raw = event_payload.get("content_raw") if isinstance(event_payload, dict) else ""
    preview = (content_raw or "").strip().replace("\n", " ")
    if len(preview) > 160:
        preview = f"{preview[:157]}..."
    return {
        "id": str(row.id),
        "status": row.status,
        "task_name": row.task_name,
        "source": event_payload.get("source") if isinstance(event_payload, dict) else None,
        "topic": event_payload.get("topic") if isinstance(event_payload, dict) else None,
        "trace_id": metadata.get("trace_id") if isinstance(metadata, dict) else None,
        "preview": preview,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }
