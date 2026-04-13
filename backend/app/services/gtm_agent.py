from __future__ import annotations

import base64
import json
import uuid
from email.message import EmailMessage

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import build_sync_engine
from app.models.user import User
from app.pipeline.encryption import decrypt
from app.services.email import send_transactional_email
from app.services.security_mode import (
    apply_pii_mapping,
    decrypt_server_private_key,
    resolve_tokens_for_magic_mode,
)


def execute_gtm_agent(user_id: str, result: dict) -> dict:
    security_mode = str(result.get("security_mode") or "magic")
    if security_mode == "magic":
        return _execute_magic_mode(user_id, result)
    return _execute_vault_mode(result)


def _execute_magic_mode(user_id: str, result: dict) -> dict:
    summary = str(result.get("blocker_summary") or "").strip()
    snippets = [item.get("text", "") for item in result.get("context_items", [])]
    private_key_pem = decrypt_server_private_key(user_id)
    pii_mapping = (
        resolve_tokens_for_magic_mode(user_id, [summary, *snippets], private_key_pem)
        if private_key_pem
        else {}
    )
    resolved_summary = apply_pii_mapping(summary, pii_mapping) if pii_mapping else summary
    draft_text = (
        "Daily GTM follow-up draft\n\n"
        f"{resolved_summary}\n\n"
        "Proposed next step: reply with urgency, clarify blocker ownership, and confirm the next revenue milestone."
    )
    draft_id = _create_gmail_draft(user_id, subject="GTM follow-up", body_html=f"<p>{draft_text}</p>")
    result["draft_payload"] = {
        **(result.get("draft_payload") or {}),
        "draft_text": draft_text,
        "context_payload": {
            **((result.get("draft_payload") or {}).get("context_payload") or {}),
            "delivery_mode": "gmail_native" if draft_id else "magic_pending",
            "gmail_draft_id": draft_id,
        },
    }
    notification = result.get("notification")
    if notification and result.get("config", {}).get("daily_digest_emails", True):
        send_transactional_email(
            to_email=result.get("user_email", ""),
            subject="GTM Daily Digest",
            html=f"<html><body><h1>GTM Daily Digest</h1><p>{resolved_summary}</p></body></html>",
        )
    return result


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


def _create_gmail_draft(user_id: str, *, subject: str, body_html: str) -> str | None:
    engine = build_sync_engine()
    with Session(engine) as session:
        user = session.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        ).scalar_one_or_none()
        if not user or not user.google_token:
            return None
        token_json = decrypt(user_id, user.google_token)

    creds_data = json.loads(token_json)
    creds = Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri"),
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
    )
    service = build("gmail", "v1", credentials=creds)

    message = EmailMessage()
    message.set_content(body_html, subtype="html")
    message["Subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
    draft = service.users().drafts().create(
        userId="me",
        body={"message": {"raw": raw}},
    ).execute()
    return draft.get("id")
