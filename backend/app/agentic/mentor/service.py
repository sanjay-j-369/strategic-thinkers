from __future__ import annotations

from app.agentic.base import BaseAgent

from .graph import build_mentor_graph


class MentorAgent(BaseAgent):
    pillar = "MENTOR"
    agent_name = "Board Member"

    def build_graph(self):
        return build_mentor_graph()


def run_mentor_review(*, user_id: str) -> dict:
    agent = MentorAgent()
    return agent.run(
        {
            "user_id": user_id,
            "profile": {},
            "prior_snapshot": {},
            "signals": {},
            "findings": [],
            "notifications": [],
            "memo": "",
        }
    )
