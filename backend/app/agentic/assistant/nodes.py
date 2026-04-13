from __future__ import annotations

import re
from typing import TypedDict

from app.agentic.context import recent_archive_items
from app.agentic.llm import complete_text


PROMISE_PATTERNS = [
    r"\b(i'll|i will|we will|we'll)\b",
    r"\b(send|share|follow up|circle back|get you)\b",
]

DRAFT_TRIGGERS = {
    "data room": "Draft a crisp response acknowledging the request and promising the latest data room link.",
    "metrics": "Draft a concise investor reply summarizing when the metrics pack will be sent.",
    "deck": "Draft a founder reply sharing the deck and inviting follow-up questions.",
    "cap table": "Draft a professional reply confirming the cap table can be shared after NDA confirmation.",
}


class AssistantState(TypedDict):
    user_id: str
    user_email: str
    security_mode: str
    mode: str
    recent_items: list[dict]
    promises: list[dict]
    drafts: list[dict]
    routing_tasks: list[dict]
    vip_alerts: list[dict]
    notifications: list[dict]
    morning_briefing: str


def load_recent_communications(state: AssistantState) -> AssistantState:
    since_hours = 12 if state["mode"] == "morning_briefing" else 24
    if state["mode"] == "ingestion_watch":
        since_hours = 4
    items = recent_archive_items(state["user_id"], since_hours=since_hours, limit=30)
    return {**state, "recent_items": items}


def extract_commitments(state: AssistantState) -> AssistantState:
    promises: list[dict] = []
    for item in state.get("recent_items", []):
        text = item.get("text", "")
        if not text:
            continue
        lowered = text.lower()
        if not any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in PROMISE_PATTERNS):
            continue
        sentence = text.replace("\n", " ").strip()[:220]
        promises.append(
            {
                "source_ref": item.get("id"),
                "promise_text": sentence,
                "promised_by": "founder",
                "confidence": 0.72,
                "context_payload": {"source": item.get("source"), "captured_at": item.get("ingested_at")},
            }
        )
    return {**state, "promises": promises}


def detect_draft_candidates(state: AssistantState) -> AssistantState:
    drafts: list[dict] = []
    for item in state.get("recent_items", []):
        text = item.get("text", "")
        lowered = text.lower()
        for trigger, fallback_instruction in DRAFT_TRIGGERS.items():
            if trigger not in lowered:
                continue
            fallback = (
                "Thanks for the note. I can share the requested materials shortly. "
                "I'll send the latest version and flag anything that changed since the last update."
            )
            draft_text = complete_text(
                f"{fallback_instruction}\n\nMessage:\n{text[:1200]}",
                fallback=fallback,
                max_tokens=220,
            )
            drafts.append(
                {
                    "source_ref": item.get("id"),
                    "channel": "email" if item.get("source") == "GMAIL" else "slack",
                    "prompt": trigger,
                    "draft_text": draft_text.strip() or fallback,
                    "context_payload": {"source": item.get("source")},
                }
            )
            break
    return {**state, "drafts": drafts}


def detect_vip_interruptions(state: AssistantState) -> AssistantState:
    alerts: list[dict] = []
    for item in state.get("recent_items", []):
        text = item.get("text", "")
        tags = item.get("context_tags") or []
        lowered = text.lower()
        is_vip = "investor" in tags or any(keyword in lowered for keyword in ("board", "lead investor", "vc", "partner"))
        if not is_vip:
            continue
        alerts.append(
            {
                "notification_type": "VIP_INTERRUPT",
                "severity": "critical",
                "title": "VIP outreach needs attention",
                "body": text[:240],
                "payload": {"source_ref": item.get("id"), "source": item.get("source")},
            }
        )
    return {**state, "vip_alerts": alerts}


def detect_context_routing(state: AssistantState) -> AssistantState:
    routing_tasks: list[dict] = []
    security_mode = state.get("security_mode", "magic")
    for item in state.get("recent_items", []):
        text = item.get("text", "")
        lowered = text.lower()
        if item.get("source") != "SLACK":
            continue
        if not any(keyword in lowered for keyword in ("deployed", "shipped", "launched", "live", "closed")):
            continue

        related_promise = next(
            (
                promise
                for promise in state.get("promises", [])
                if any(term in promise.get("promise_text", "").lower() for term in ("investor", "partner", "customer"))
            ),
            None,
        )
        if not related_promise:
            continue

        stakeholder = "Investor"
        if "customer" in related_promise.get("promise_text", "").lower():
            stakeholder = "Customer"
        subject = f"Update for {stakeholder}: recent product milestone"
        if security_mode == "magic":
            body = (
                f"Assistant drafted an update to {stakeholder} based on recent Slack activity.\n\n"
                f"Slack signal: {text[:220]}\n\n"
                f"Promise context: {related_promise.get('promise_text', '')[:220]}"
            )
        else:
            body = (
                f"Assistant drafted a vault-safe update to {stakeholder} based on recent Slack activity.\n\n"
                "Resolve private names and deliver this from the app."
            )
        routing_tasks.append(
            {
                "source_ref": item.get("id"),
                "channel": "email",
                "prompt": subject,
                "draft_text": body,
                "context_payload": {
                    "draft_type": "CONTEXT_ROUTING",
                    "source": item.get("source"),
                    "source_topic": item.get("topic"),
                    "stakeholder": stakeholder,
                    "promise_ref": related_promise.get("source_ref"),
                    "security_mode": security_mode,
                },
            }
        )
    return {**state, "routing_tasks": routing_tasks}


def compose_assistant_outputs(state: AssistantState) -> AssistantState:
    snippets = []
    for item in state.get("recent_items", [])[:8]:
        tags = ", ".join(item.get("context_tags") or [])
        snippets.append(f"[{item.get('source')}] ({tags}) {item.get('text', '')[:220]}")

    fallback_brief = "Overnight activity was light. No major issues surfaced."
    if snippets:
        fallback_brief = "\n".join(f"- {snippet}" for snippet in snippets[:4])
    briefing = complete_text(
        "Turn these founder communications into a prioritized morning briefing with clear urgency cues:\n\n"
        + "\n---\n".join(snippets),
        fallback=fallback_brief,
        max_tokens=260,
    )

    notifications = list(state.get("vip_alerts", []))
    if state["mode"] == "morning_briefing":
        notifications.append(
            {
                "notification_type": "MORNING_BRIEFING",
                "severity": "info",
                "title": "Morning briefing ready",
                "body": briefing.strip() or fallback_brief,
                "payload": {
                    "promise_count": len(state.get("promises", [])),
                    "draft_count": len(state.get("drafts", [])),
                },
            }
        )
    if state["mode"] in {"morning_briefing", "promise_digest"} and state.get("promises"):
        notifications.append(
            {
                "notification_type": "PROMISE_DIGEST",
                "severity": "warning",
                "title": "Unfulfilled promises to review",
                "body": "\n".join(f"- {item['promise_text'][:120]}" for item in state["promises"][:5]),
                "payload": {"count": len(state["promises"])},
            }
        )
    if state.get("drafts"):
        notifications.append(
            {
                "notification_type": "AUTO_DRAFT_READY",
                "severity": "info",
                "title": "Draft replies prepared",
                "body": f"{len(state['drafts'])} reply draft(s) are ready for approval.",
                "payload": {"count": len(state["drafts"])},
            }
        )
    if state.get("routing_tasks"):
        routing = state["routing_tasks"][0]
        notifications.append(
            {
                "notification_type": "CONTEXT_ROUTING_READY",
                "severity": "info",
                "title": f"Assistant drafted an update to {routing.get('context_payload', {}).get('stakeholder', 'stakeholder')}",
                "body": f"Assistant drafted an update based on recent {routing.get('context_payload', {}).get('source', 'activity')}.",
                "payload": routing.get("context_payload"),
            }
        )
    if state["mode"] == "ingestion_watch" and not notifications:
        # Ensure ingestion-triggered assistant runs are visible in the feed.
        notifications.append(
            {
                "notification_type": "INGESTION_WATCH_UPDATE",
                "severity": "info",
                "title": "New context processed",
                "body": (briefing.strip() or fallback_brief)[:320],
                "payload": {
                    "promise_count": len(state.get("promises", [])),
                    "draft_count": len(state.get("drafts", [])),
                },
            }
        )

    return {
        **state,
        "drafts": [*state.get("drafts", []), *state.get("routing_tasks", [])],
        "morning_briefing": briefing.strip() or fallback_brief,
        "notifications": notifications,
    }
