import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel
from slack_sdk.errors import SlackApiError
from sqlalchemy import select

from app.ingestion.calendar import sync_calendar_events_for_user
from app.ingestion.gmail import GmailWorker
from app.ingestion.slack import SlackWorker
from app.models.user import User
from app.pipeline.encryption import decrypt, encrypt
from app.security import (
    create_access_token,
    hash_password,
    require_current_user,
    resolve_user,
    user_public_dict,
    verify_password,
)

load_dotenv(Path(__file__).resolve().parents[4] / ".env")

router = APIRouter(prefix="/api/auth", tags=["auth"])

_flow_store: dict[str, dict] = {}
_slack_state_store: dict[str, dict] = {}

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]
SLACK_SCOPES = [
    "channels:history",
    "channels:read",
    "groups:history",
    "groups:read",
    "im:history",
    "mpim:history",
]

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8001/api/auth/google/callback"
)
SLACK_REDIRECT_URI = os.getenv(
    "SLACK_REDIRECT_URI", "http://localhost:8001/api/auth/slack/callback"
)

class SignUpBody(BaseModel):
    email: str
    password: str
    full_name: str | None = None


class SignInBody(BaseModel):
    email: str
    password: str


class ConnectStartBody(BaseModel):
    return_to: str = "/ingest"


class SlackSyncBody(BaseModel):
    channel_ids: list[str] = []


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _frontend_redirect(path: str, **params: str) -> RedirectResponse:
    query = urlencode({key: value for key, value in params.items() if value})
    url = f"{FRONTEND_URL}{path}"
    if query:
        url = f"{url}?{query}"
    return RedirectResponse(url=url, status_code=302)


def _make_flow() -> Flow:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Google OAuth is not configured")

    return Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uris": [GOOGLE_REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI,
    )


async def _load_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters"
        )


@router.post("/signup")
async def sign_up(body: SignUpBody, request: Request):
    email = _normalize_email(body.email)
    password = body.password
    full_name = (body.full_name or "").strip() or None

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    _validate_password(password)

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user and user.password_hash:
            raise HTTPException(status_code=409, detail="Email already exists")

        if user is None:
            user = User(email=email, full_name=full_name)
            session.add(user)
            await session.flush()
        else:
            if full_name and not user.full_name:
                user.full_name = full_name

        user.password_hash = hash_password(password)
        await session.commit()
        await session.refresh(user)

    return {"token": create_access_token(user), "user": user_public_dict(user)}


@router.post("/signin")
async def sign_in(body: SignInBody, request: Request):
    email = _normalize_email(body.email)
    password = body.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"token": create_access_token(user), "user": user_public_dict(user)}


@router.get("/me")
async def me(request: Request):
    user = await require_current_user(request)
    return {"user": user_public_dict(user)}


@router.get("/integrations")
async def integrations(request: Request):
    user = await require_current_user(request)
    return {
        "google": {
            "connected": bool(user.google_token),
            "last_synced_at": user.google_last_synced_at.isoformat()
            if user.google_last_synced_at
            else None,
        },
        "slack": {
            "connected": bool(user.slack_token),
            "team_id": user.slack_team_id,
            "channel_ids": json.loads(user.slack_channel_ids or "[]"),
            "last_synced_at": user.slack_last_synced_at.isoformat()
            if user.slack_last_synced_at
            else None,
        },
    }


@router.post("/google/start")
async def google_start(request: Request, body: ConnectStartBody | None = None):
    user = await require_current_user(request)
    return_to = (body.return_to if body else None) or "/ingest"

    flow = _make_flow()
    auth_url, state = flow.authorization_url(
        prompt="consent",
        access_type="offline",
        include_granted_scopes="true",
    )
    _flow_store[state] = {"flow": flow, "user_id": str(user.id), "return_to": return_to}
    return {"auth_url": auth_url}


@router.get("/google/callback")
async def google_callback(code: str, state: str, request: Request):
    stored = _flow_store.pop(state, None)
    if stored is None:
        return _frontend_redirect(
            "/ingest", integration="google", status="error", message="Invalid state"
        )

    flow: Flow = stored["flow"]
    user_id = stored["user_id"]
    return_to = stored["return_to"]

    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
    flow.fetch_token(code=code)
    credentials = flow.credentials

    try:
        userinfo = await _load_userinfo(credentials.token)
    except Exception:
        userinfo = {}

    oauth_email = _normalize_email(userinfo.get("email", ""))

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        if not user:
            return _frontend_redirect(
                return_to,
                integration="google",
                status="error",
                message="User not found",
            )

        if oauth_email and oauth_email != user.email:
            return _frontend_redirect(
                return_to,
                integration="google",
                status="error",
                message="Google account email does not match the signed-in user",
            )

        user.google_token = encrypt(str(user.id), credentials.to_json())
        await session.commit()

    return _frontend_redirect(return_to, integration="google", status="connected")


@router.delete("/google/disconnect")
async def google_disconnect(request: Request):
    user = await require_current_user(request)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        db_user.google_token = None
        db_user.google_last_synced_at = None
        await session.commit()
    return {"status": "disconnected"}


@router.post("/google/sync")
async def google_sync(request: Request):
    user = await require_current_user(request)
    if not user.google_token:
        raise HTTPException(status_code=400, detail="Google is not connected")

    token_json = decrypt(str(user.id), user.google_token)
    gmail_worker = GmailWorker()
    gmail_worker.authenticate(token_json)
    gmail_events = gmail_worker.poll(
        str(user.id),
        max_results=10,
        after=user.google_last_synced_at,
    )
    calendar_result = sync_calendar_events_for_user(
        user_id=str(user.id),
        user_email=user.email,
        credentials_json=token_json,
        lookahead_days=14,
    )

    now = datetime.now(timezone.utc)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        db_user.google_last_synced_at = now
        await session.commit()

    return {
        "status": "synced",
        "gmail_events": len(gmail_events),
        "calendar_events": calendar_result["new_meetings"],
        "prep_cards": calendar_result["prep_queued"],
    }


@router.post("/slack/start")
async def slack_start(request: Request, body: ConnectStartBody | None = None):
    user = await require_current_user(request)
    client_id = os.getenv("SLACK_CLIENT_ID", "")
    client_secret = os.getenv("SLACK_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Slack OAuth is not configured")

    return_to = (body.return_to if body else None) or "/ingest"
    state = secrets.token_urlsafe(24)
    _slack_state_store[state] = {"user_id": str(user.id), "return_to": return_to}
    auth_url = "https://slack.com/oauth/v2/authorize?" + urlencode(
        {
            "client_id": client_id,
            "scope": ",".join(SLACK_SCOPES),
            "redirect_uri": SLACK_REDIRECT_URI,
            "state": state,
        }
    )
    return {"auth_url": auth_url}


@router.get("/slack/callback")
async def slack_callback(code: str, state: str, request: Request):
    stored = _slack_state_store.pop(state, None)
    if stored is None:
        return _frontend_redirect(
            "/ingest", integration="slack", status="error", message="Invalid state"
        )

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "code": code,
                "client_id": os.getenv("SLACK_CLIENT_ID", ""),
                "client_secret": os.getenv("SLACK_CLIENT_SECRET", ""),
                "redirect_uri": SLACK_REDIRECT_URI,
            },
        )
        data = response.json()

    if not data.get("ok"):
        return _frontend_redirect(
            stored["return_to"],
            integration="slack",
            status="error",
            message=data.get("error", "Slack connection failed"),
        )

    token = data.get("access_token")
    team_id = (data.get("team") or {}).get("id")
    if not token:
        return _frontend_redirect(
            stored["return_to"],
            integration="slack",
            status="error",
            message="Slack access token missing",
        )

    user_id = stored["user_id"]
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        if not user:
            return _frontend_redirect(
                stored["return_to"],
                integration="slack",
                status="error",
                message="User not found",
            )

        user.slack_token = encrypt(str(user.id), token)
        user.slack_team_id = team_id
        await session.commit()

    return _frontend_redirect(stored["return_to"], integration="slack", status="connected")


@router.get("/slack/channels")
async def slack_channels(request: Request):
    user = await require_current_user(request)
    if not user.slack_token:
        raise HTTPException(status_code=400, detail="Slack is not connected")

    worker = SlackWorker(token=decrypt(str(user.id), user.slack_token))
    try:
        channels = worker.list_channels(limit=100)
    except SlackApiError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"channels": channels}


@router.delete("/slack/disconnect")
async def slack_disconnect(request: Request):
    user = await require_current_user(request)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        db_user.slack_token = None
        db_user.slack_team_id = None
        db_user.slack_channel_ids = None
        db_user.slack_last_synced_at = None
        await session.commit()
    return {"status": "disconnected"}


@router.post("/slack/sync")
async def slack_sync(request: Request, body: SlackSyncBody | None = None):
    user = await require_current_user(request)
    if not user.slack_token:
        raise HTTPException(status_code=400, detail="Slack is not connected")

    requested_channels = (body.channel_ids if body else None) or []
    worker = SlackWorker(token=decrypt(str(user.id), user.slack_token))

    channels = requested_channels
    if not channels:
        if user.slack_channel_ids:
            channels = json.loads(user.slack_channel_ids)
        else:
            channels = [channel["id"] for channel in worker.list_channels(limit=20)]

    events = worker.poll_channels(
        user_id=str(user.id),
        channel_ids=channels,
        limit=20,
        oldest=user.slack_last_synced_at.timestamp()
        if user.slack_last_synced_at
        else None,
    )

    now = datetime.now(timezone.utc)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        db_user.slack_channel_ids = json.dumps(channels)
        db_user.slack_last_synced_at = now
        await session.commit()

    return {
        "status": "synced",
        "channels": channels,
        "messages": len(events),
    }


@router.delete("/disconnect")
async def disconnect_auth(request: Request):
    user = await require_current_user(request)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        db_user.google_token = None
        db_user.slack_token = None
        db_user.google_last_synced_at = None
        db_user.slack_last_synced_at = None
        db_user.slack_channel_ids = None
        db_user.slack_team_id = None
        await session.commit()
    return {"status": "disconnected"}
