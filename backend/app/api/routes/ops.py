from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, select

from app.models.agent_notification import AgentNotification
from app.models.agent_run import AgentRun
from app.models.draft_reply import DraftReply
from app.models.promise_item import PromiseItem
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
