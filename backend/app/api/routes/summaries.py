from fastapi import APIRouter, Request, Query
from sqlalchemy import select
from app.models.summary import Summary

router = APIRouter(prefix="/api/summaries", tags=["summaries"])


@router.get("")
async def list_summaries(
    request: Request,
    user_id: str = Query(..., description="User UUID"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    """Return paginated list of summaries for the authenticated user."""
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Summary)
            .where(Summary.user_id == user_id)
            .order_by(Summary.generated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        summaries = result.scalars().all()
    return {"summaries": [s.to_dict() for s in summaries], "total": len(summaries)}
