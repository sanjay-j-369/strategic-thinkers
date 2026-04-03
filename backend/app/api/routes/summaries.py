from fastapi import APIRouter, Request, Query
import json
from sqlalchemy import select
from app.models.summary import Summary
from app.security import resolve_user

router = APIRouter(prefix="/api/summaries", tags=["summaries"])


@router.get("")
async def list_summaries(
    request: Request,
    user_id: str | None = Query(None, description="User UUID"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    """Return paginated list of summaries for the authenticated user."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Summary)
            .where(Summary.user_id == user.id)
            .order_by(Summary.generated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        summaries = result.scalars().all()

    items = []
    for summary in summaries:
        data = summary.to_dict()
        raw = data.get("summary_text", "")
        if isinstance(raw, str) and raw.strip().startswith("{"):
            try:
                data["payload"] = json.loads(raw)
            except Exception:
                pass
        items.append(data)

    return {"summaries": items, "total": len(items)}
