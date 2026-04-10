import os
import json
from fastapi import APIRouter, Request, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from app.pipeline.encryption import decrypt

from app.models.archive import Archive
from app.models.pii_vault import PiiVault
from app.security import resolve_user

router = APIRouter(prefix="/api/archive", tags=["privacy"])


class ResolvePIITokensBody(BaseModel):
    tokens: list[str]


@router.get("")
async def list_archive(
    request: Request,
    user_id: str | None = Query(None, description="User UUID"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    """Paginated list of archive items — metadata only, no decryption."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive)
            .where(Archive.user_id == user.id)
            .order_by(Archive.ingested_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = result.scalars().all()
        total = await session.scalar(
            select(func.count()).select_from(Archive).where(Archive.user_id == user.id)
        )
    return {
        "items": [
            {
                "id": str(item.id),
                "user_id": str(item.user_id),
                "source": item.source,
                "context_tags": item.context_tags,
                "pii_tokens": item.pii_tokens,
                "ingested_at": item.ingested_at.isoformat(),
            }
            for item in items
        ],
        "total": total or 0,
    }


@router.post("/pii/resolve")
async def resolve_pii_tokens(
    body: ResolvePIITokensBody,
    request: Request,
    user_id: str | None = Query(None),
):
    user = await resolve_user(request, user_id=user_id)
    tokens = sorted({token for token in body.tokens if token})
    if not tokens:
        return {
            "pii_mapping_enc": {},
            "pii_mapping_plain": {},
            "pii_mapping_scheme": {},
        }

    async_session = request.app.state.async_session
    async with async_session() as session:
        rows = (
            await session.execute(
                select(PiiVault).where(
                    PiiVault.user_id == user.id,
                    PiiVault.token.in_(tokens),
                )
            )
        ).scalars().all()

    enc: dict[str, str] = {}
    plain: dict[str, str] = {}
    scheme: dict[str, str] = {}
    for row in rows:
        row_scheme = _safe_scheme(row)
        scheme[row.token] = row_scheme
        if row_scheme == "rsa_oaep":
            enc[row.token] = row.encrypted_value
        else:
            try:
                plain[row.token] = decrypt(str(user.id), row.encrypted_value)
            except Exception:
                pass

    return {
        "pii_mapping_enc": enc,
        "pii_mapping_plain": plain,
        "pii_mapping_scheme": scheme,
    }


@router.get("/{item_id}")
async def get_archive_item(
    item_id: str,
    request: Request,
    user_id: str | None = Query(None),
):
    """Return stored redacted content with encrypted token mapping."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user.id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Archive item not found")

        data = item.to_dict()
        data["content_enc"] = item.content_enc
        data["content_encryption_scheme"] = _detect_content_scheme(item.content_enc)
        data["content"] = item.content_redacted or ""
        data["content_redacted"] = item.content_redacted or ""

        pii_tokens = item.pii_tokens or []
        pii_rows = await session.execute(
            select(PiiVault).where(PiiVault.user_id == user.id, PiiVault.token.in_(pii_tokens))
        )
        data["pii_tokens"] = sorted(pii_tokens)
        data["pii_mapping_enc"] = {
            row.token: row.encrypted_value for row in pii_rows.scalars().all()
        }
        try:
            pii_scheme_rows = await session.execute(
                select(PiiVault).where(PiiVault.user_id == user.id, PiiVault.token.in_(pii_tokens))
            )
            data["pii_mapping_scheme"] = {
                row.token: row.encryption_scheme for row in pii_scheme_rows.scalars().all()
            }
        except SQLAlchemyError:
            # Legacy schema fallback (no encryption_scheme column).
            data["pii_mapping_scheme"] = {
                token: "fernet" for token in data["pii_mapping_enc"].keys()
            }

        # Backward compatibility for old Fernet rows only.
        reconstructed = data["content_redacted"]
        has_rsa_rows = any(
            scheme == "rsa_oaep" for scheme in data["pii_mapping_scheme"].values()
        )
        if not has_rsa_rows:
            for token, enc_val in data["pii_mapping_enc"].items():
                try:
                    decrypted = decrypt(str(user.id), enc_val)
                    reconstructed = reconstructed.replace(token, decrypted)
                except Exception:
                    pass
        data["content"] = reconstructed

    return data


def _detect_content_scheme(content_enc: str) -> str:
    try:
        payload = json.loads(content_enc)
    except (TypeError, ValueError):
        return "fernet"
    if isinstance(payload, dict) and payload.get("scheme") == "rsa_aes_gcm":
        return "rsa_aes_gcm"
    return "fernet"


def _safe_scheme(row: PiiVault) -> str:
    try:
        return row.encryption_scheme
    except Exception:
        return "fernet"


@router.delete("/{item_id}")
async def delete_archive_item(
    item_id: str, request: Request, user_id: str | None = Query(None)
):
    """Delete from Postgres and remove vector from Pinecone."""
    user = await resolve_user(request, user_id=user_id)
    async_session = request.app.state.async_session
    async with async_session() as session:
        result = await session.execute(
            select(Archive).where(Archive.id == item_id, Archive.user_id == user.id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Archive item not found")

        # Delete from Pinecone
        try:
            import pinecone as pc
            index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))
            index.delete(ids=[item_id], namespace="founder_memory")
        except Exception:
            pass  # Best-effort Pinecone deletion

        await session.delete(item)
        await session.commit()

    return {"status": "deleted", "id": item_id}
