import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid

from fastapi import HTTPException, Request
from sqlalchemy import select

from app.config import settings
from app.models.user import User

SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
PBKDF2_ITERATIONS = 390_000


def _secret_key() -> bytes:
    value = os.environ.get("MASTER_FERNET_KEY") or "founders-dev-secret"
    return value.encode("utf-8")


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"{_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash or "$" not in stored_hash:
        return False

    salt_b64, digest_b64 = stored_hash.split("$", 1)
    expected = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        _b64decode(salt_b64),
        PBKDF2_ITERATIONS,
    )
    return hmac.compare_digest(expected, _b64decode(digest_b64))


def is_password_hash_format(stored_hash: str | None) -> bool:
    """Validate local password hash format to support legacy-account recovery paths."""
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        salt_b64, digest_b64 = stored_hash.split("$", 1)
        salt = _b64decode(salt_b64)
        digest = _b64decode(digest_b64)
    except Exception:
        return False
    return len(salt) >= 8 and len(digest) >= 16


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
    }
    encoded_payload = _b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = _b64encode(
        hmac.new(
            _secret_key(),
            encoded_payload.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )
    return f"{encoded_payload}.{signature}"


def decode_access_token(token: str) -> dict:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc

    expected_signature = _b64encode(
        hmac.new(
            _secret_key(),
            encoded_payload.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )
    if not hmac.compare_digest(encoded_signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid session token")

    payload = json.loads(_b64decode(encoded_payload).decode("utf-8"))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Session expired")

    return payload


def user_public_dict(user: User) -> dict:
    try:
        public_key = user.__dict__.get("public_key")
    except Exception:
        public_key = None

    try:
        security_mode = (
            user.security_mode.value
            if hasattr(user.security_mode, "value")
            else str(user.security_mode)
        )
    except Exception:
        security_mode = "magic"

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "security_mode": security_mode,
        "public_key": public_key,
        "created_at": user.created_at.isoformat(),
        "google_connected": bool(user.google_token),
        "slack_connected": bool(user.slack_token),
        "google_last_synced_at": user.google_last_synced_at.isoformat()
        if user.google_last_synced_at
        else None,
        "slack_last_synced_at": user.slack_last_synced_at.isoformat()
        if user.slack_last_synced_at
        else None,
    }


def _bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.removeprefix("Bearer ").strip() or None


async def get_optional_current_user(request: Request) -> User | None:
    token = _bearer_token(request)
    if not token:
        if settings.DEMO_MODE:
            async_session = request.app.state.async_session
            async with async_session() as session:
                result = await session.execute(
                    select(User).where(User.id == uuid.UUID(settings.DEMO_USER_ID))
                )
                user = result.scalar_one_or_none()
                if user:
                    return user
            try:
                from app.demo.persona import ensure_demo_persona

                ensure_demo_persona(reset=False)
            except Exception:
                return None
            async with async_session() as session:
                result = await session.execute(
                    select(User).where(User.id == uuid.UUID(settings.DEMO_USER_ID))
                )
                return result.scalar_one_or_none()
        return None

    payload = decode_access_token(token)
    user_id = payload.get("sub", "")

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
        return result.scalar_one_or_none()


async def require_current_user(request: Request) -> User:
    user = await get_optional_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def resolve_user(
    request: Request,
    *,
    user_id: str | None = None,
    required: bool = True,
) -> User | None:
    authed_user = await get_optional_current_user(request)
    if authed_user:
        return authed_user

    if not user_id:
        if required:
            raise HTTPException(status_code=401, detail="Authentication required")
        return None

    try:
        parsed_user_id = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user_id") from exc

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == parsed_user_id))
        user = result.scalar_one_or_none()

    if not user and required:
        raise HTTPException(status_code=404, detail="User not found")
    return user
