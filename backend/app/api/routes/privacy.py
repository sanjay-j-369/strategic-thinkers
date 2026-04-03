import os
from fastapi import APIRouter, Request, Query, HTTPException
from sqlalchemy import func, select

from app.models.archive import Archive
from app.models.pii_vault import PiiVault
from app.security import resolve_user

router = APIRouter(prefix="/api/archive", tags=["privacy"])


@router.get("")
async def list_archive(
    request: Request,
    user_id: str | None = Query(None, description="User UUID"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    """Paginated list of archive items — metadata only, no decryption."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive)
            .where(Archive.user_id == user.id)
            .order_by(Archive.ingested_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = result.scalars().all()
        total = await session.scalar(
            select(func.count()).select_from(Archive).where(Archive.user_id == user.id)
        )
    return {
        "items": [
            {
                "id": str(item.id),
                "user_id": str(item.user_id),
                "source": item.source,
                "context_tags": item.context_tags,
                "pii_tokens": item.pii_tokens,
                "ingested_at": item.ingested_at.isoformat(),
            }
            for item in items
        ],
        "total": total or 0,
    }


@router.get("/{item_id}")
async def get_archive_item(
    item_id: str,
    request: Request,
    user_id: str | None = Query(None),
):
    """Return stored redacted content with encrypted token mapping."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user.id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Archive item not found")

        data = item.to_dict()
        data["content"] = item.content_redacted or ""
        data["content_redacted"] = item.content_redacted or ""

        pii_tokens = item.pii_tokens or []
        pii_rows = await session.execute(
            select(PiiVault).where(PiiVault.user_id == user.id, PiiVault.token.in_(pii_tokens))
        )
        data["pii_tokens"] = sorted(pii_tokens)
        data["pii_mapping_enc"] = {
            row.token: row.encrypted_value for row in pii_rows.scalars().all()
        }
    return data


@router.delete("/{item_id}")
async def delete_archive_item(
    item_id: str, request: Request, user_id: str | None = Query(None)
):
    """Delete from Postgres and remove vector from Pinecone."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user.id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Archive item not found")

        # Delete from Pinecone
        try:
            import pinecone as pc
            index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))
            index.delete(ids=[item_id], namespace="founder_memory")
        except Exception:
            pass  # Best-effort Pinecone deletion

        await session.delete(item)
        await session.commit()

    return {"status": "deleted", "id": item_id}
