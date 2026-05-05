from __future__ import annotations

import re
from typing import TypedDict

from app.agentic.context import load_startup_profile, query_memory_by_tags
from app.agentic.llm import complete_text

PII_EMAIL_TOKEN = r"<EMAIL_[a-f0-9]+>"
PII_PERSON_TOKEN = r"<PERSON_[a-f0-9]+>"
FROM_EMAIL_PATTERN = re.compile(
    rf"From:\s*({PII_PERSON_TOKEN}|[^<\n]+?)\s*<({PII_EMAIL_TOKEN}|[^>\s]+@[^>\s]+)>",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(
    rf"\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{{2,}})\b|({PII_EMAIL_TOKEN})",
    re.IGNORECASE,
)
GTM_EXCLUDED_TAGS = {"hiring", "recruiting", "hr", "candidates", "interviews"}
GTM_ALLOWED_TAGS = {"gtm", "customer", "revenue", "sales", "pipeline", "churn", "renewal", "expansion", "billing"}


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
    items = _filter_items_for_lane(state["lane"], items)
    profile_item = _startup_profile_context_item(state["user_id"], state["lane"])
    if profile_item:
        items = [profile_item, *items]
    return {**state, "context_items": items}


def identify_blockers(state: WorkerState) -> WorkerState:
    snippets = [item.get("text", "")[:300] for item in state.get("context_items", [])]
    instructions = state.get("config", {}).get("custom_instructions", "")
    blocker_lines = []
    for snippet in snippets:
        lowered = snippet.lower()
        if state.get("lane") == "gtm":
            if any(
                word in lowered
                for word in (
                    "churn",
                    "renewal",
                    "expansion",
                    "pipeline",
                    "customer",
                    "client",
                    "revenue",
                    "billing",
                    "invoice",
                    "contract",
                    "blocked",
                    "escalation",
                )
            ):
                blocker_lines.append(snippet.strip())
            continue

        if any(word in lowered for word in ("blocked", "staging", "down", "failed", "outage", "bug", "escalation")):
            blocker_lines.append(snippet.strip())

    fallback = "No strong blocker signal found."
    if blocker_lines:
        fallback = "\n".join(f"- {line}" for line in blocker_lines[:3])
    prompt = _summary_prompt_for_lane(state["lane"], instructions, snippets)
    summary = complete_text(
        prompt,
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
    if state.get("lane") == "gtm":
        title = "GTM report ready"
    else:
        title = f"{state['worker_name']} surfaced actions"
    body = state.get("blocker_summary", "").strip()
    body = (
        f"{body}\n\nVault mode is active. Founder OS will save a local draft "
        "until the founder opens the app and explicitly sends it."
    )
    notification_type = "WORKER_FOLLOW_UP"
    if state.get("lane") == "gtm":
        notification_type = "GTM_REPORT_READY"
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
            "report_markdown": body if state.get("lane") == "gtm" else None,
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
            return {"email": (email_match.group(1) or email_match.group(2)).strip()}, item

    return {}, None


def _filter_items_for_lane(lane: str, items: list[dict]) -> list[dict]:
    if lane != "gtm":
        return items

    filtered = []
    for item in items:
        tags = set(item.get("context_tags") or [])
        if tags & GTM_EXCLUDED_TAGS:
            continue
        if tags & GTM_ALLOWED_TAGS:
            filtered.append(item)
    return filtered


def _startup_profile_context_item(user_id: str, lane: str) -> dict | None:
    profile = load_startup_profile(user_id)
    if not profile:
        return None

    text = (
        "Startup profile: "
        f"stage={profile.get('stage') or 'unknown'}, "
        f"MRR=${float(profile.get('mrr_usd') or 0):,.0f}, "
        f"burn=${float(profile.get('burn_rate_usd') or 0):,.0f}/mo, "
        f"runway={float(profile.get('runway_months') or 0):.1f} months, "
        f"headcount={profile.get('headcount') or 'unknown'}, "
        f"has_cto={profile.get('has_cto')}, "
        f"dev_spend_pct={float(profile.get('dev_spend_pct') or 0):.0%}."
    )
    tags = ["startup-profile", "metrics", lane]
    if lane == "gtm":
        tags.extend(["gtm", "revenue"])
    return {
        "id": f"startup-profile:{user_id}",
        "source": "PROFILE",
        "text": text,
        "context_tags": tags,
        "ingested_at": profile.get("updated_at"),
    }


def _summary_prompt_for_lane(lane: str, instructions: str, snippets: list[str]) -> str:
    if lane == "gtm":
        return (
            "You are the GTM worker. Produce a concise GTM-only report from these snippets.\n"
            "Scope: sales pipeline, customer escalations, renewals, expansion, churn risk, revenue blockers, and customer commitments.\n"
            "Exclude hiring, recruiting, candidate evaluation, engineering-only details, and generic operational advice unless directly tied to customer or revenue impact.\n"
            "Use sections: Revenue/Customer Signals, Risks, Recommended Founder Actions, Owners/Dates.\n"
            f"Worker instructions: {instructions or 'None provided.'}\n\n"
            + "\n---\n".join(snippets[:8])
        )
    return (
        "Summarize the operational blockers from these snippets in 2 bullet points.\n"
        f"Worker instructions: {instructions or 'None provided.'}\n\n"
        + "\n---\n".join(snippets[:8])
    )
