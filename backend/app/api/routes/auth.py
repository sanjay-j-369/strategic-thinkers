from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from app.models.user import User
from app.pipeline.encryption import encrypt

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]


def _get_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"),
    )


@router.get("/google")
async def google_auth():
    """Redirect to Google OAuth consent screen."""
    flow = _get_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(request: Request, code: str):
    """Handle Google OAuth callback, save encrypted token."""
    flow = _get_flow()
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

    # Get DB session from app state
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
