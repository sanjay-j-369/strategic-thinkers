import os
from fastapi import APIRouter, Request, Query, HTTPException
from sqlalchemy import func, select

from app.models.archive import Archive
from app.pipeline.encryption import decrypt
from app.pipeline.pii import strip_pii
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
    return {"items": [item.to_dict() for item in items], "total": total or 0}


@router.get("/{item_id}")
async def get_archive_item(
    item_id: str,
    request: Request,
    user_id: str | None = Query(None),
    include_raw: bool = Query(False),
):
    """Return redacted content with token mapping; optionally include raw decrypted text."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user.id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Archive item not found")

        user_id_str = str(user.id)
        plaintext = decrypt(user_id_str, item.content_enc)
        redacted_content, pii_mapping_enc = strip_pii(plaintext, user_id_str)
        pii_mapping = {}
        for token, enc_value in pii_mapping_enc.items():
            try:
                pii_mapping[token] = decrypt(user_id_str, enc_value)
            except Exception:
                continue

        data = item.to_dict()
        data["content"] = redacted_content
        data["content_redacted"] = redacted_content
        data["pii_mapping"] = pii_mapping
        data["pii_tokens"] = sorted(list(pii_mapping.keys()))
        if include_raw:
            data["content_raw"] = plaintext
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
