from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from sqlalchemy import select
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from app.models.user import User
from app.pipeline.encryption import encrypt

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-memory store for OAuth flow state (keyed by state param)
_flow_store: dict[str, Flow] = {}

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]

REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")


def _make_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "redirect_uris": [REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=REDIRECT_URI,
    )


@router.get("/google")
async def google_auth():
    """Redirect to Google OAuth consent screen."""
    flow = _make_flow()
    auth_url, state = flow.authorization_url(
        prompt="consent",
        access_type="offline",
        include_granted_scopes="true",
    )
    # Store flow so callback can reuse it (preserves state/verifier)
    _flow_store[state] = flow
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(request: Request, code: str, state: str):
    """Handle Google OAuth callback, save encrypted token."""
    # Reuse the same flow object from the auth step
    flow = _flow_store.pop(state, None)
    if flow is None:
        # Fallback: create fresh flow (won't work with PKCE but worth trying)
        flow = _make_flow()

    # Allow insecure transport for local dev
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    flow.fetch_token(code=code)
    credentials = flow.credentials

    import google.oauth2.id_token
    import google.auth.transport.requests

    id_info = google.oauth2.id_token.verify_oauth2_token(
        credentials.id_token,
        google.auth.transport.requests.Request(),
        os.getenv("GOOGLE_CLIENT_ID", ""),
    )
    email = id_info.get("email", "")

    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        token_json = credentials.to_json()

        if user is None:
            user = User(email=email)
            session.add(user)
            await session.flush()

        user.google_token = encrypt(str(user.id), token_json)
        await session.commit()

    return {"status": "connected", "email": email}


@router.delete("/disconnect")
async def disconnect_auth(request: Request, user_id: str):
    """Remove OAuth tokens for a user."""
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.google_token = None
        user.slack_token = None
        await session.commit()
    return {"status": "disconnected"}
