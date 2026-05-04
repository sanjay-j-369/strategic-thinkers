from __future__ import annotations

import re
from typing import TypedDict

from app.agentic.context import query_memory_by_tags
from app.agentic.llm import complete_text

FROM_EMAIL_PATTERN = re.compile(r"From:\s*([^<\n]+?)\s*<([^>\s]+@[^>\s]+)>", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b", re.IGNORECASE)


class WorkerState(TypedDict):
    user_id: str
    user_email: str
    security_mode: str
    google_connected: bool
    worker_key: str
    worker_name: str
    lane: str
    tags: list[str]
    config: dict
    context_items: list[dict]
    blockers: list[str]
    blocker_summary: str
    draft_payload: dict | None
    notification: dict | None


def load_lane_context(state: WorkerState) -> WorkerState:
    monitor_targets = state.get("config", {}).get("monitor_targets", "")
    custom_instructions = state.get("config", {}).get("custom_instructions", "")
    items = query_memory_by_tags(
        state["user_id"],
        tags=state["tags"],
        query_text=" ".join(
            part
            for part in (
                f"{state['worker_name']} blocker scan",
                monitor_targets,
                custom_instructions,
            )
            if part
        ),
        since_hours=24,
    )
    return {**state, "context_items": items}


def identify_blockers(state: WorkerState) -> WorkerState:
    snippets = [item.get("text", "")[:300] for item in state.get("context_items", [])]
    instructions = state.get("config", {}).get("custom_instructions", "")
    blocker_lines = []
    for snippet in snippets:
        lowered = snippet.lower()
        if any(word in lowered for word in ("blocked", "staging", "down", "failed", "outage", "bug", "escalation")):
            blocker_lines.append(snippet.strip())

    fallback = "No strong blocker signal found."
    if blocker_lines:
        fallback = "\n".join(f"- {line}" for line in blocker_lines[:3])
    summary = complete_text(
        "Summarize the operational blockers from these snippets in 2 bullet points.\n"
        f"Worker instructions: {instructions or 'None provided.'}\n\n"
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

    security_mode = "vault"
    title = f"{state['worker_name']} surfaced actions"
    body = state.get("blocker_summary", "").strip()
    body = (
        f"{body}\n\nVault mode is active. Founder OS will save a local draft "
        "until the founder opens the app and explicitly sends it."
    )
    notification_type = "WORKER_FOLLOW_UP"
    notification = {
        "notification_type": notification_type,
        "severity": "warning",
        "title": title,
        "body": body,
        "payload": {
            "worker_key": state["worker_key"],
            "worker_name": state["worker_name"],
            "security_mode": security_mode,
            "lane": state["lane"],
            "tags": state["tags"],
            "monitor_targets": state.get("config", {}).get("monitor_targets"),
            "context_count": len(state.get("context_items", [])),
        },
    }
    first_context_item = (state.get("context_items") or [{}])[0]
    recipient, recipient_context = _recipient_from_context_items(state.get("context_items") or [])
    context_item_for_draft = recipient_context or first_context_item
    context_payload = {
        **notification["payload"],
        "draft_type": "WORKER_FOLLOW_UP",
        "source": context_item_for_draft.get("source"),
        "source_url": context_item_for_draft.get("source_url"),
    }
    if recipient.get("email"):
        context_payload["to_email"] = recipient["email"]
    if recipient.get("name"):
        context_payload["recipient_hint"] = recipient["name"]

    draft_payload = {
        "source_ref": context_item_for_draft.get("id"),
        "channel": "email",
        "prompt": f"{state['worker_name']} follow-up",
        "draft_text": body,
        "context_payload": context_payload,
    }
    return {**state, "notification": notification, "draft_payload": draft_payload}


def _recipient_from_context_items(context_items: list[dict]) -> tuple[dict[str, str], dict | None]:
    for item in context_items:
        text = item.get("text") or ""
        from_match = FROM_EMAIL_PATTERN.search(text)
        if from_match:
            return (
                {
                    "name": from_match.group(1).strip(),
                    "email": from_match.group(2).strip(),
                },
                item,
            )

        email_match = EMAIL_PATTERN.search(text)
        if email_match:
            return {"email": email_match.group(1).strip()}, item

    return {}, None
