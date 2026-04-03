import json
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.demo.persona import enqueue_demo_history, ensure_demo_persona, get_demo_snapshot

router = APIRouter(prefix="/api/demo", tags=["demo"])


class DemoBootstrapBody(BaseModel):
    reset: bool = False


class DemoTriggerBody(BaseModel):
    mode: str = "single"  # "single" | "full"


def _guard_demo_mode():
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=404, detail="Demo mode is disabled")


@router.get("/status")
async def demo_status():
    return {
        "demo_mode": bool(settings.DEMO_MODE),
        "demo_user_id": settings.DEMO_USER_ID,
    }


@router.get("/snapshot")
async def demo_snapshot():
    _guard_demo_mode()
    ensure_demo_persona(reset=False)
    return get_demo_snapshot()


@router.post("/bootstrap")
async def bootstrap_demo(body: DemoBootstrapBody):
    _guard_demo_mode()
    ensure_demo_persona(reset=body.reset)
    queued = enqueue_demo_history(
        source="all",
        mode="full",
        include_prep=True,
        include_growth=True,
    )
    return {"status": "queued", **queued}


@router.post("/trigger-email")
async def trigger_demo_email(body: DemoTriggerBody | None = None):
    _guard_demo_mode()
    ensure_demo_persona(reset=False)
    queued = enqueue_demo_history(source="gmail", mode=(body.mode if body else "single"))
    return {"status": "queued", **queued}


@router.post("/trigger-slack")
async def trigger_demo_slack(body: DemoTriggerBody | None = None):
    _guard_demo_mode()
    ensure_demo_persona(reset=False)
    queued = enqueue_demo_history(source="slack", mode=(body.mode if body else "single"))
    return {"status": "queued", **queued}


@router.post("/trigger-prep")
async def trigger_meeting_prep():
    _guard_demo_mode()
    ensure_demo_persona(reset=False)
    queued = enqueue_demo_history(source="all", mode="single", include_prep=True)
    return {"status": "queued", **queued}


@router.post("/trigger-growth")
async def trigger_growth_milestone():
    _guard_demo_mode()
    ensure_demo_persona(reset=False)
    queued = enqueue_demo_history(source="all", mode="single", include_growth=True)
    return {"status": "queued", **queued}


@router.post("/reset")
async def reset_demo():
    _guard_demo_mode()
    ensure_demo_persona(reset=True)
    queued = enqueue_demo_history(
        source="all",
        mode="full",
        include_prep=True,
        include_growth=True,
    )

    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        redis_client.publish(
            f"founder:{settings.DEMO_USER_ID}",
            json.dumps(
                {
                    "type": "DEMO_RESET",
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                }
            ),
        )
    except Exception:
        pass

    return {"status": "reset-and-queued", **queued}
