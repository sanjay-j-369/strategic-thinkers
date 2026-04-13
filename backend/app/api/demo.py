from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.demo.persona import enqueue_demo_history, ensure_demo_persona, get_demo_snapshot
from app.observability import emit_demo_log, emit_demo_log_async
from app.pipeline.action_items import detect_action_item_signal
from app.runtime.task_names import TaskNames
from app.schemas.events import FounderEvent, FounderEventMetadata, FounderEventPayload, Source, TaskType

router = APIRouter(prefix="/api/demo", tags=["demo"])

SCENARIO_DIR = Path(__file__).resolve().parents[2] / "scenarios"


class DemoBootstrapBody(BaseModel):
    reset: bool = False


class DemoTriggerBody(BaseModel):
    mode: str = "single"


class DemoEventRequest(BaseModel):
    user_id: str
    source: str
    raw_payload: dict = Field(default_factory=dict)


class DemoScenarioRequest(BaseModel):
    user_id: str
    scenario_name: str


def _guard_demo_mode() -> None:
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=403, detail="Demo mode is disabled")


def _scenario_path(name: str) -> Path:
    safe_name = Path(name).name
    if safe_name.endswith(".json"):
        safe_name = safe_name[:-5]
    path = SCENARIO_DIR / f"{safe_name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    return path


def _load_scenario_events(name: str) -> list[dict]:
    path = _scenario_path(name)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Scenario JSON is invalid: {path.name}") from exc
    if not isinstance(payload, list):
        raise HTTPException(status_code=500, detail="Scenario file must contain a JSON array")
    return payload


def _scenario_timestamp(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _build_founder_event(
    *,
    user_id: str,
    source: str,
    raw_payload: dict,
    scenario_name: str | None = None,
) -> FounderEvent:
    try:
        parsed_user_id = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user_id") from exc

    source_key = source.strip().lower()
    payload = raw_payload or {}
    timestamp = _scenario_timestamp(payload.get("timestamp"))
    context_tags = [source_key, "demo"]
    if scenario_name:
        context_tags.append(f"scenario:{scenario_name}")
    context_tags.extend(payload.get("context_tags") or [])

    if source_key == "gmail":
        sender = payload.get("sender") or {}
        sender_email = payload.get("from_address") or sender.get("email") or "demo@example.com"
        sender_name = sender.get("name") or ""
        from_line = f"{sender_name} <{sender_email}>" if sender_name else sender_email
        subject = payload.get("subject") or "Demo email"
        body = payload.get("body") or ""
        content = f"Subject: {subject}\nFrom: {from_line}\n\n{body}"
        entities = [item for item in [sender_name, sender_email] if item]
        topic = subject
        event_source = Source.GMAIL
        signal_tags = ["email"]
    elif source_key == "slack":
        sender = payload.get("sender") or {}
        sender_name = sender.get("name") or payload.get("sender_name") or "Demo User"
        channel = payload.get("channel") or "#general"
        channel = channel if channel.startswith("#") else f"#{channel}"
        body = payload.get("body") or payload.get("message") or ""
        content = f"Channel: {channel}\nFrom: {sender_name}\n\n{body}"
        entities = [sender_name]
        topic = channel
        event_source = Source.SLACK
        signal_tags = ["slack"]
    else:
        raise HTTPException(status_code=400, detail="source must be 'slack' or 'gmail'")

    return FounderEvent(
        metadata=FounderEventMetadata(
            user_id=parsed_user_id,
            trace_id=payload.get("trace_id") or str(uuid.uuid4()),
            timestamp=timestamp,
        ),
        task_type=TaskType.DATA_INGESTION,
        payload=FounderEventPayload(
            source=event_source,
            content_raw=content,
            content_redacted="",
            context_tags=list(dict.fromkeys(context_tags)),
            entities=entities,
            topic=topic,
            source_id=payload.get("source_id"),
            source_url=payload.get("source_url"),
            is_action_item=detect_action_item_signal(content, signal_tags),
        ),
    )


async def _enqueue_founder_event(request: Request, event: FounderEvent) -> str:
    task_id = await request.app.state.task_queue.enqueue(
        TaskNames.FOUNDER_EVENT,
        {"event": event.model_dump(mode="json")},
        priority=3,
    )
    return task_id


@router.get("/status")
async def demo_status():
    return {
        "demo_mode": bool(settings.DEMO_MODE),
        "demo_user_id": settings.DEMO_USER_ID,
    }


@router.get("/scenarios")
async def list_scenarios():
    _guard_demo_mode()
    items = []
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        if path.name.startswith("_"):
            continue
        events = _load_scenario_events(path.stem)
        items.append(
            {
                "name": path.stem,
                "event_count": len(events),
                "sources": sorted({str(event.get("source", "")).lower() for event in events if event.get("source")}),
                "first_timestamp": events[0].get("timestamp") if events else None,
            }
        )
    return {"items": items}


@router.post("/trigger-event")
async def trigger_event(body: DemoEventRequest, request: Request, background_tasks: BackgroundTasks):
    _guard_demo_mode()
    event = _build_founder_event(user_id=body.user_id, source=body.source, raw_payload=body.raw_payload)
    task_id = await _enqueue_founder_event(request, event)

    background_tasks.add_task(
        emit_demo_log_async,
        user_id=body.user_id,
        message=f"[Demo Simulator] Queued {body.source.lower()} event into the standard founder ingestion queue.",
        pillar="DEMO",
        agent_name="Demo Simulator",
        event_type="demo_event",
        step="queued",
        details={"task_id": task_id, "trace_id": event.metadata.trace_id},
    )

    return {"status": "queued", "task_id": task_id, "trace_id": event.metadata.trace_id}


@router.post("/trigger-scenario")
async def trigger_scenario(body: DemoScenarioRequest, request: Request):
    _guard_demo_mode()
    events = sorted(_load_scenario_events(body.scenario_name), key=lambda item: item.get("timestamp") or "")

    await emit_demo_log_async(
        user_id=body.user_id,
        message=f"[Demo Simulator] Starting scenario {body.scenario_name} with {len(events)} event(s).",
        pillar="DEMO",
        agent_name="Demo Simulator",
        event_type="demo_scenario",
        step="started",
        details={"scenario_name": body.scenario_name, "event_count": len(events)},
    )

    queued = []
    for index, scenario_event in enumerate(events, start=1):
        event = _build_founder_event(
            user_id=body.user_id,
            source=str(scenario_event.get("source", "")),
            raw_payload=scenario_event,
            scenario_name=body.scenario_name,
        )
        task_id = await _enqueue_founder_event(request, event)
        queued.append({"task_id": task_id, "trace_id": event.metadata.trace_id})
        emit_demo_log(
            user_id=body.user_id,
            message=(
                f"[Demo Simulator] Fired scenario event {index}/{len(events)} "
                f"from {event.payload.source.value}."
            ),
            pillar="DEMO",
            agent_name="Demo Simulator",
            event_type="demo_event",
            step="queued",
            details={
                "scenario_name": body.scenario_name,
                "task_id": task_id,
                "trace_id": event.metadata.trace_id,
                "source": event.payload.source.value,
            },
        )
        if index < len(events):
            await asyncio.sleep(0.15)

    return {
        "status": "queued",
        "scenario_name": body.scenario_name,
        "queued": len(queued),
        "events": queued,
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
async def reset_demo(request: Request):
    _guard_demo_mode()
    ensure_demo_persona(reset=True)
    queued = enqueue_demo_history(
        source="all",
        mode="full",
        include_prep=True,
        include_growth=True,
    )

    await request.app.state.notification_bus.publish_to_user(
        settings.DEMO_USER_ID,
        {
            "type": "DEMO_RESET",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {"status": "reset-and-queued", **queued}

@router.get("/users")
async def list_demo_users(request: Request):
    from sqlalchemy import select
    from app.models import User
    
    async with request.app.state.async_session() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        return {"users": [{"id": str(u.id), "email": u.email, "full_name": u.full_name} for u in users]}
