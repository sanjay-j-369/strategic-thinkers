import json
import base64
from email.message import EmailMessage
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.exceptions import RefreshError
from pydantic import BaseModel

from app.security import require_current_user
from app.models.user import User
from app.pipeline.encryption import decrypt, encrypt

router = APIRouter(prefix="/api/gmail", tags=["gmail"])

class CreateDraftRequest(BaseModel):
    to_email: str
    subject: str
    body_html: str

class SendDraftRequest(BaseModel):
    updated_body_html: str

def get_gmail_service(user: User):
    if not user.google_token:
        raise HTTPException(status_code=400, detail="Google account not connected")
    token_json = decrypt(str(user.id), user.google_token)
    creds_data = json.loads(token_json)
    creds = Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri"),
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
    )
    return build("gmail", "v1", credentials=creds), creds

async def handle_refresh_token(request: Request, user: User, creds: Credentials):
    if creds.expired and creds.refresh_token:
        import google.auth.transport.requests
        request_auth = google.auth.transport.requests.Request()
        try:
            creds.refresh(request_auth)
            # Update the token in the database
            async_session: AsyncSession = request.app.state.async_session()
            async with async_session as session:
                db_user = await session.scalar(select(User).where(User.id == user.id))
                creds_json = {
                    "token": creds.token,
                    "refresh_token": creds.refresh_token,
                    "token_uri": creds.token_uri,
                    "client_id": creds.client_id,
                    "client_secret": creds.client_secret,
                }
                db_user.google_token = encrypt(str(user.id), json.dumps(creds_json))
                await session.commit()
        except RefreshError:
            raise HTTPException(status_code=401, detail="Google token expired, reconnect Google Account")
    elif creds.expired:
        raise HTTPException(status_code=401, detail="Google token expired, reconnect Google Account")

def encode_message(message: EmailMessage) -> str:
    encoded = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
    return encoded

@router.post("/drafts/create")
async def create_draft(req: CreateDraftRequest, request: Request):
    user = await require_current_user(request)
    service, creds = get_gmail_service(user)
    await handle_refresh_token(request, user, creds)
    
    try:
        message = EmailMessage()
        message.set_content(req.body_html, subtype='html')
        message['To'] = req.to_email
        message['Subject'] = req.subject

        create_message = {'message': {'raw': encode_message(message)}}
        draft = service.users().drafts().create(userId="me", body=create_message).execute()
        return {"draft_id": draft['id']}
    except Exception as e:
        if "Unauthorized" in str(e) or "Forbidden" in str(e) or "invalid_grant" in str(e):
            raise HTTPException(status_code=401, detail="Reconnect Google Account")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/drafts")
async def list_drafts(request: Request):
    user = await require_current_user(request)
    service, creds = get_gmail_service(user)
    await handle_refresh_token(request, user, creds)

    try:
        drafts_response = service.users().drafts().list(userId="me", maxResults=20).execute()
        drafts_list = drafts_response.get("drafts", [])
        
        result = []
        for d in drafts_list:
            draft_id = d["id"]
            draft_details = service.users().drafts().get(userId="me", id=draft_id, format="full").execute()
            msg = draft_details.get("message", {})
            headers = msg.get("payload", {}).get("headers", [])
            headers_dict = {h["name"]: h["value"] for h in headers}
            
            # Find body
            body_data = ""
            payload = msg.get("payload", {})
            parts = payload.get("parts", [])
            if not parts and "data" in payload.get("body", {}):
                body_data = base64.urlsafe_b64decode(payload["body"]["data"] + "===").decode("utf-8", errors="ignore")
            else:
                for part in parts:
                    if part.get("mimeType") == "text/html" or part.get("mimeType") == "text/plain":
                        if "data" in part.get("body", {}):
                            body_data = base64.urlsafe_b64decode(part["body"]["data"] + "===").decode("utf-8", errors="ignore")
                            if part.get("mimeType") == "text/html":
                                break
                            
            result.append({
                "draft_id": draft_id,
                "to": headers_dict.get("To", ""),
                "subject": headers_dict.get("Subject", ""),
                "snippet": msg.get("snippet", ""),
                "body": body_data
            })
        return result
    except Exception as e:
        if "Unauthorized" in str(e) or "Forbidden" in str(e) or "invalid_grant" in str(e):
            raise HTTPException(status_code=401, detail="Reconnect Google Account")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/drafts/{draft_id}/send")
async def send_draft(draft_id: str, req: SendDraftRequest, request: Request):
    user = await require_current_user(request)
    service, creds = get_gmail_service(user)
    await handle_refresh_token(request, user, creds)

    try:
        draft_details = service.users().drafts().get(userId="me", id=draft_id, format="full").execute()
        msg = draft_details.get("message", {})
        headers = msg.get("payload", {}).get("headers", [])
        headers_dict = {h["name"]: h["value"] for h in headers}

        message = EmailMessage()
        message.set_content(req.updated_body_html, subtype='html')
        if headers_dict.get("To"):
            message['To'] = headers_dict["To"]
        if headers_dict.get("Subject"):
            message['Subject'] = headers_dict["Subject"]

        update_message = {'message': {'raw': encode_message(message)}}
        service.users().drafts().update(userId="me", id=draft_id, body=update_message).execute()

        # 2. send
        send_response = service.users().drafts().send(userId="me", body={'id': draft_id}).execute()
        return {"status": "success", "message_id": send_response.get("id")}
    except Exception as e:
        if "Unauthorized" in str(e) or "Forbidden" in str(e) or "invalid_grant" in str(e):
            raise HTTPException(status_code=401, detail="Reconnect Google Account")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, request: Request):
    user = await require_current_user(request)
    service, creds = get_gmail_service(user)
    await handle_refresh_token(request, user, creds)

    try:
        service.users().drafts().delete(userId="me", id=draft_id).execute()
        return {"status": "deleted", "draft_id": draft_id}
    except Exception as e:
        if "Unauthorized" in str(e) or "Forbidden" in str(e) or "invalid_grant" in str(e):
            raise HTTPException(status_code=401, detail="Reconnect Google Account")
        raise HTTPException(status_code=500, detail=str(e))
