from __future__ import annotations

from typing import TypedDict

from app.agentic.context import query_memory_by_tags
from app.agentic.llm import complete_text


class WorkerState(TypedDict):
    user_id: str
    lane: str
    tags: list[str]
    context_items: list[dict]
    blockers: list[str]
    blocker_summary: str
    notification: dict | None


def load_lane_context(state: WorkerState) -> WorkerState:
    items = query_memory_by_tags(
        state["user_id"],
        tags=state["tags"],
        query_text=f"{state['lane']} blocker scan",
        since_hours=24,
    )
    return {**state, "context_items": items}


def identify_blockers(state: WorkerState) -> WorkerState:
    snippets = [item.get("text", "")[:300] for item in state.get("context_items", [])]
    blocker_lines = []
    for snippet in snippets:
        lowered = snippet.lower()
        if any(word in lowered for word in ("blocked", "staging", "down", "failed", "outage", "bug", "escalation")):
            blocker_lines.append(snippet.strip())

    fallback = "No strong blocker signal found."
    if blocker_lines:
        fallback = "\n".join(f"- {line}" for line in blocker_lines[:3])
    summary = complete_text(
        "Summarize the operational blockers from these snippets in 2 bullet points:\n\n"
        + "\n---\n".join(snippets[:8]),
        fallback=fallback,
        max_tokens=220,
    )
    return {
        **state,
        "blockers": blocker_lines[:5],
        "blocker_summary": summary.strip() or fallback,
    }


def compose_operator_alert(state: WorkerState) -> WorkerState:
    if not state.get("context_items"):
        return {**state, "notification": None}
    if not state.get("blockers") and "no strong blocker" in state.get("blocker_summary", "").lower():
        return {**state, "notification": None}

    title = f"{state['lane'].upper()} Worker surfaced blockers"
    body = state.get("blocker_summary", "").strip()
    notification = {
        "notification_type": "OPERATOR_ALERT",
        "severity": "warning",
        "title": title,
        "body": body,
        "payload": {
            "lane": state["lane"],
            "tags": state["tags"],
            "context_count": len(state.get("context_items", [])),
        },
    }
    return {**state, "notification": notification}
