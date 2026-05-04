from __future__ import annotations

import re
import uuid
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import build_sync_engine
from app.models.pii_vault import PiiVault
from app.models.user import User
from app.pipeline.asymmetric_encryption import decrypt_with_private_key
from app.pipeline.encryption import decrypt

PII_TOKEN_PATTERN = re.compile(r"<[A-Z_]+_[a-f0-9]+>")


def load_user_security_context(user_id: str) -> dict:
    engine = build_sync_engine()
    with Session(engine) as session:
        user = session.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        ).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        return {
            "email": user.email,
            "security_mode": "vault",
            "google_connected": bool(user.google_token),
        }


def decrypt_server_private_key(user_id: str) -> str | None:
    engine = build_sync_engine()
    with Session(engine) as session:
        user = session.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        ).scalar_one_or_none()
        if not user:
            return None
        encrypted_private_key = user.__dict__.get("server_encrypted_private_key")
        if not encrypted_private_key:
            return None
    return decrypt(user_id, encrypted_private_key)


def resolve_tokens_for_magic_mode(
    user_id: str,
    values: Iterable[str],
    private_key_pem: str,
) -> dict[str, str]:
    tokens = sorted({token for value in values for token in PII_TOKEN_PATTERN.findall(value or "")})
    if not tokens:
        return {}

    engine = build_sync_engine()
    with Session(engine) as session:
        rows = session.execute(
            select(PiiVault).where(
                PiiVault.user_id == uuid.UUID(user_id),
                PiiVault.token.in_(tokens),
            )
        ).scalars().all()

    mapping: dict[str, str] = {}
    for row in rows:
        scheme = row.__dict__.get("encryption_scheme") or "fernet"
        if scheme == "rsa_oaep":
            mapping[row.token] = decrypt_with_private_key(private_key_pem, row.encrypted_value)
        else:
            mapping[row.token] = decrypt(user_id, row.encrypted_value)
    return mapping


def apply_pii_mapping(value: str, mapping: dict[str, str]) -> str:
    resolved = value
    for token, plain in mapping.items():
        resolved = resolved.replace(token, plain)
    return resolved
