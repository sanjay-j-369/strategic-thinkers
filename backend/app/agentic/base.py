from __future__ import annotations

from abc import ABC, abstractmethod


class BaseAgent(ABC):
    pillar: str
    agent_name: str

    @abstractmethod
    def build_graph(self):
        raise NotImplementedError

    def run(self, state: dict) -> dict:
        return self.build_graph().invoke(state)
