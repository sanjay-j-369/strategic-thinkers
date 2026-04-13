from __future__ import annotations

from app.agentic.base import BaseAgent
from app.services.security_mode import load_user_security_context

from .graph import build_assistant_graph


class AssistantAgent(BaseAgent):
    pillar = "ASSISTANT"
    agent_name = "Chief of Staff"

    def build_graph(self):
        return build_assistant_graph()


def run_assistant_cycle(*, user_id: str, mode: str) -> dict:
    security = load_user_security_context(user_id)
    agent = AssistantAgent()
    return agent.run(
        {
            "user_id": user_id,
            "user_email": security["email"],
            "security_mode": security["security_mode"],
            "mode": mode,
            "recent_items": [],
            "promises": [],
            "drafts": [],
            "routing_tasks": [],
            "vip_alerts": [],
            "notifications": [],
            "morning_briefing": "",
        }
    )
