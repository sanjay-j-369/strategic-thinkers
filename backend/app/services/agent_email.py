from __future__ import annotations


def postprocess_agent_email(
    *,
    user_id: str,
    security_mode: str,
    agent_name: str,
    subject: str,
    body: str,
    recipient_hint: str,
    send_transactional: bool = False,
) -> dict:
    _ = user_id, security_mode, send_transactional
    return _vault_email(agent_name=agent_name, subject=subject, body=body, recipient_hint=recipient_hint)


def _vault_email(*, agent_name: str, subject: str, body: str, recipient_hint: str) -> dict:
    return {
        "channel": "email",
        "status": "DRAFT",
        "prompt": subject,
        "draft_text": f"{body}\n\nFollow up with <UUID_CONTACT> about <UUID_TOPIC>.",
        "context_payload": {
            "draft_type": "AGENT_EMAIL",
            "agent_name": agent_name,
            "recipient_hint": recipient_hint,
            "delivery_mode": "vault_pending",
        },
    }
