from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps
from typing import Callable
from uuid import uuid4

from app.api.ws import manager


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_log(
    *,
    user_id: str | None,
    message: str,
    pillar: str,
    agent_name: str,
    level: str = "info",
    event_type: str = "agent_log",
    node_name: str | None = None,
    step: str | None = None,
    details: dict | None = None,
) -> dict:
    return {
        "type": event_type,
        "log_id": str(uuid4()),
        "generated_at": _iso_now(),
        "user_id": user_id,
        "pillar": pillar,
        "agent_name": agent_name,
        "level": level,
        "node_name": node_name,
        "step": step,
        "message": message,
        "details": details or {},
    }


def emit_demo_log(
    *,
    user_id: str | None,
    message: str,
    pillar: str,
    agent_name: str,
    level: str = "info",
    event_type: str = "agent_log",
    node_name: str | None = None,
    step: str | None = None,
    details: dict | None = None,
) -> None:
    manager.emit_admin(
        _build_log(
            user_id=user_id,
            message=message,
            pillar=pillar,
            agent_name=agent_name,
            level=level,
            event_type=event_type,
            node_name=node_name,
            step=step,
            details=details,
        )
    )


async def emit_demo_log_async(
    *,
    user_id: str | None,
    message: str,
    pillar: str,
    agent_name: str,
    level: str = "info",
    event_type: str = "agent_log",
    node_name: str | None = None,
    step: str | None = None,
    details: dict | None = None,
) -> None:
    await manager.send_to_admins(
        _build_log(
            user_id=user_id,
            message=message,
            pillar=pillar,
            agent_name=agent_name,
            level=level,
            event_type=event_type,
            node_name=node_name,
            step=step,
            details=details,
        )
    )


def observe_node(
    *,
    pillar: str,
    agent_name: str,
    node_name: str,
    start_message: str | Callable[[dict], str],
    end_message: str | Callable[[dict, dict], str] | None = None,
):
    def decorator(fn):
        @wraps(fn)
        def wrapped(state: dict):
            user_id = str(state.get("user_id", "")) or None
            started_message = start_message(state) if callable(start_message) else start_message
            emit_demo_log(
                user_id=user_id,
                message=started_message,
                pillar=pillar,
                agent_name=agent_name,
                node_name=node_name,
                step="started",
            )
            try:
                result = fn(state)
            except Exception as exc:
                emit_demo_log(
                    user_id=user_id,
                    message=f"[{agent_name}] {node_name} failed: {exc}",
                    pillar=pillar,
                    agent_name=agent_name,
                    level="error",
                    node_name=node_name,
                    step="failed",
                    details={"error": str(exc)},
                )
                raise

            if end_message:
                finished_message = end_message(state, result) if callable(end_message) else end_message
            else:
                finished_message = f"[{agent_name}] Completed {node_name}."
            emit_demo_log(
                user_id=user_id,
                message=finished_message,
                pillar=pillar,
                agent_name=agent_name,
                node_name=node_name,
                step="completed",
            )
            return result

        return wrapped

    return decorator
