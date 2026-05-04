from __future__ import annotations


def execute_gtm_agent(user_id: str, result: dict) -> dict:
    _ = user_id
    return _execute_vault_mode(result)


def _execute_vault_mode(result: dict) -> dict:
    summary = str(result.get("blocker_summary") or "").strip()
    skeleton = (
        "Vault Mode skeleton draft\n\n"
        f"{summary}\n\n"
        "Follow up with <UUID_CONTACT> about <UUID_TOPIC> and confirm the next GTM milestone."
    )
    result["draft_payload"] = {
        **(result.get("draft_payload") or {}),
        "draft_text": skeleton,
        "context_payload": {
            **((result.get("draft_payload") or {}).get("context_payload") or {}),
            "delivery_mode": "vault_pending",
        },
    }
    return result
