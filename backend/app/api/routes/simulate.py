import uuid
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/simulate", tags=["simulate"])

DEMO_USER_ID = "550e8400-e29b-41d4-a716-446655440000"


class SimulateRequest(BaseModel):
    user_id: str = DEMO_USER_ID
    source: str = "all"  # "gmail" | "slack" | "calendar" | "all"


@router.post("")
def trigger_simulation(body: SimulateRequest):
    """Manually fire simulator events for a user."""
    from app.ingestion.simulator.gmail_sim import GmailSimulator
    from app.ingestion.simulator.slack_sim import SlackSimulator
    from app.ingestion.simulator.calendar_sim import poll_calendar_simulated

    # Ensure valid UUID
    try:
        uid = str(uuid.UUID(body.user_id))
    except ValueError:
        uid = DEMO_USER_ID

    fired = []

    if body.source in ("gmail", "all"):
        GmailSimulator().poll(uid)
        fired.append("gmail")

    if body.source in ("slack", "all"):
        SlackSimulator().poll(uid)
        fired.append("slack")

    if body.source in ("calendar", "all"):
        poll_calendar_simulated.delay(uid)
        fired.append("calendar")

    return {"status": "queued", "user_id": uid, "fired": fired}
