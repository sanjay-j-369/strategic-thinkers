from __future__ import annotations

from app.agentic.base import BaseAgent

from .graph import build_assistant_graph


class AssistantAgent(BaseAgent):
    pillar = "ASSISTANT"
    agent_name = "Chief of Staff"

    def build_graph(self):
        return build_assistant_graph()


def run_assistant_cycle(*, user_id: str, mode: str) -> dict:
    agent = AssistantAgent()
    return agent.run(
        {
            "user_id": user_id,
            "mode": mode,
            "recent_items": [],
            "promises": [],
            "drafts": [],
            "vip_alerts": [],
            "notifications": [],
            "morning_briefing": "",
        }
    )
