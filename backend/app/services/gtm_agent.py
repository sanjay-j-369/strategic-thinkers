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
        summary = "There are open operational items that need a clear owner and next milestone."

    return (
        "Hi,\n\n"
        "I wanted to follow up on the open items the team flagged:\n\n"
        f"{summary}\n\n"
        "Can you confirm the owner, next milestone, and timing so we can keep this moving?\n\n"
        "Best,"
    )
