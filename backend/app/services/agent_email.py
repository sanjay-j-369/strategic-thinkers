from __future__ import annotations

import re


EMAIL_PATTERN = re.compile(r"\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b", re.IGNORECASE)


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
    context_payload = {
        "draft_type": "AGENT_EMAIL",
        "agent_name": agent_name,
        "recipient_hint": recipient_hint,
        "delivery_mode": "vault_pending",
    }
    email_match = EMAIL_PATTERN.search(recipient_hint or "")
    if email_match:
        context_payload["to_email"] = email_match.group(1)

    return {
        "channel": "email",
        "status": "DRAFT",
        "prompt": subject,
        "draft_text": body,
        "context_payload": context_payload,
    }
