from __future__ import annotations

from app.agentic.base import BaseAgent

from .graph import build_worker_graph


ROLE_TAGS = {
    "gtm": ["gtm", "customer", "support"],
    "cto": ["technical", "hiring", "incident"],
    "dev": ["technical", "customer", "burn"],
}


class WorkerLaneAgent(BaseAgent):
    pillar = "WORKER"
    agent_name = "AI Worker"

    def build_graph(self):
        return build_worker_graph()


def run_worker_lane(*, lane: str, user_id: str) -> dict:
    agent = WorkerLaneAgent()
    return agent.run(
        {
            "user_id": user_id,
            "lane": lane,
            "tags": ROLE_TAGS.get(lane, ["technical"]),
            "context_items": [],
            "blockers": [],
            "blocker_summary": "",
            "notification": None,
        }
    )
