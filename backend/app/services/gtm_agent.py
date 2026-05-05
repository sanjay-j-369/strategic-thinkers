from __future__ import annotations


def execute_gtm_agent(user_id: str, result: dict) -> dict:
    _ = user_id
    return _execute_vault_mode(result)


def _execute_vault_mode(result: dict) -> dict:
    summary = str(result.get("blocker_summary") or "").strip()
    body = _compose_founder_reviewed_follow_up(summary)
    result["draft_payload"] = {
        **(result.get("draft_payload") or {}),
        "draft_text": body,
        "context_payload": {
            **((result.get("draft_payload") or {}).get("context_payload") or {}),
            "delivery_mode": "vault_pending",
        },
    }
    return result


def _compose_founder_reviewed_follow_up(summary: str) -> str:
    if not summary:
        summary = "No material GTM blocker was found in the latest customer, revenue, or pipeline signals."

    return (
        "GTM Advisor Report\n\n"
        f"{summary}\n\n"
        "Founder review checklist:\n"
        "- Confirm the revenue or customer owner for each open item.\n"
        "- Decide whether a customer-facing update is needed today.\n"
        "- Adjust GTM worker focus in the worker config if this report should track a narrower segment, account, or pipeline stage."
    )
