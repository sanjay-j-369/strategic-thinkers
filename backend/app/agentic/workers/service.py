from __future__ import annotations

from app.agentic.base import BaseAgent
from app.services.security_mode import load_user_security_context
from app.services.worker_directory import get_worker_runtime

from .graph import build_worker_graph


class WorkerLaneAgent(BaseAgent):
    pillar = "WORKER"
    agent_name = "AI Worker"

    def build_graph(self):
        return build_worker_graph()


def run_worker_agent(*, worker_key: str, user_id: str, config: dict | None = None) -> dict:
    worker = get_worker_runtime(worker_key, config=config)
    security = load_user_security_context(user_id)
    agent = WorkerLaneAgent()
    return agent.run(
        {
            "user_id": user_id,
            "user_email": security["email"],
            "security_mode": security["security_mode"],
            "google_connected": security["google_connected"],
            "worker_key": worker["worker_key"],
            "worker_name": worker["worker_name"],
            "lane": worker["lane"],
            "tags": worker["tags"],
            "config": worker["config"],
            "context_items": [],
            "blockers": [],
            "blocker_summary": "",
            "notification": None,
        }
    )
