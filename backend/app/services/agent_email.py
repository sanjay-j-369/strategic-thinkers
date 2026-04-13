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
    if security_mode == "magic":
        return _magic_email(
            user_id=user_id,
            agent_name=agent_name,
            subject=subject,
            body=body,
            recipient_hint=recipient_hint,
            send_transactional=send_transactional,
        )
    return _vault_email(agent_name=agent_name, subject=subject, body=body, recipient_hint=recipient_hint)


def _magic_email(
    *,
    user_id: str,
    agent_name: str,
    subject: str,
    body: str,
    recipient_hint: str,
    send_transactional: bool,
) -> dict:
    private_key_pem = decrypt_server_private_key(user_id)
    mapping = resolve_tokens_for_magic_mode(user_id, [subject, body, recipient_hint], private_key_pem) if private_key_pem else {}
    resolved_subject = apply_pii_mapping(subject, mapping) if mapping else subject
    resolved_body = apply_pii_mapping(body, mapping) if mapping else body
    resolved_recipient = apply_pii_mapping(recipient_hint, mapping) if mapping else recipient_hint
    gmail_draft_id = _create_gmail_draft(
        user_id,
        subject=resolved_subject,
        body_html=f"<p>{resolved_body.replace(chr(10), '<br />')}</p>",
    )
    if send_transactional:
        user_email = _load_user_email(user_id)
        if user_email:
            send_transactional_email(
                to_email=user_email,
                subject=resolved_subject,
                html=f"<html><body><h1>{agent_name}</h1><p>{resolved_body}</p></body></html>",
            )
    return {
        "channel": "email",
        "status": "DRAFT",
        "prompt": subject,
        "draft_text": resolved_body,
        "context_payload": {
            "draft_type": "AGENT_EMAIL",
            "agent_name": agent_name,
            "recipient_hint": resolved_recipient,
            "delivery_mode": "gmail_native" if gmail_draft_id else "magic_pending",
            "gmail_draft_id": gmail_draft_id,
        },
    }


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


def _load_user_email(user_id: str) -> str | None:
    engine = build_sync_engine()
    with Session(engine) as session:
        user = session.execute(select(User).where(User.id == uuid.UUID(user_id))).scalar_one_or_none()
        return user.email if user else None


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
