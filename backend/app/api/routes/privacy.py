import os
from fastapi import APIRouter, Request, Query, HTTPException
from sqlalchemy import select
from app.models.archive import Archive
from app.pipeline.encryption import decrypt

router = APIRouter(prefix="/api/archive", tags=["privacy"])


@router.get("")
async def list_archive(
    request: Request,
    user_id: str = Query(..., description="User UUID"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    """Paginated list of archive items — metadata only, no decryption."""
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive)
            .where(Archive.user_id == user_id)
            .order_by(Archive.ingested_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = result.scalars().all()
    return {"items": [item.to_dict() for item in items], "total": len(items)}


@router.get("/{item_id}")
async def get_archive_item(item_id: str, request: Request, user_id: str = Query(...)):
    """Decrypt and return a single archive item."""
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Archive item not found")

        plaintext = decrypt(user_id, item.content_enc)
        data = item.to_dict()
        data["content"] = plaintext
    return data


@router.delete("/{item_id}")
async def delete_archive_item(item_id: str, request: Request, user_id: str = Query(...)):
    """Delete from Postgres and remove vector from Pinecone."""
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user_id)
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
