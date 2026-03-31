from fastapi import APIRouter
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from groq import Groq

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    user_id: str
    message: str
    history: list[dict] = []


@router.post("")
def chat(body: ChatRequest):
    client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

    context = _get_context(body.user_id, body.message)

    system_prompt = f"""You are a strategic AI advisor for founders.
You have direct access to the founder's recent emails and Slack messages shown below.
Answer questions specifically based on this data. Quote relevant parts when useful.
If asked about a specific email or message, find it in the context and summarize it.
ALWAYS preserve privacy tokens EXACTLY as they appear in the text (e.g. <PHONE_NUMBER_8a2b>). Do not modify or truncate them.

FOUNDER'S EMAILS & SLACK MESSAGES:
{context}

Be direct and specific. Reference actual content and tokens from the messages above."""

    messages = [{"role": "system", "content": system_prompt}]
    messages += body.history[-10:]
    messages.append({"role": "user", "content": body.message})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
    )

    reply = response.choices[0].message.content
    pii_mapping = {}

    try:
        import re
        import uuid
        from sqlalchemy import create_engine, select
        from sqlalchemy.orm import Session
        from app.models.pii_vault import PiiVault
        from app.pipeline.encryption import decrypt

        # Find tokens like <PHONE_NUMBER_8a2b>
        tokens = set(re.findall(r"<[A-Z0-9_]+_[a-f0-9]+>", reply))
        if tokens:
            db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
            engine = create_engine(db_url)
            with Session(engine) as session:
                for token in tokens:
                    item = session.execute(
                        select(PiiVault).where(PiiVault.token == token, PiiVault.user_id == uuid.UUID(body.user_id))
                    ).scalar_one_or_none()
                    if item:
                        try:
                            plaintext = decrypt(body.user_id, item.encrypted_value)
                            from cryptography.fernet import Fernet
                            # random key for symmetric encryption to frontend
                            mock_key = b'7C9_xH7n-2TfA8XmK_j_yWkXN2q48R_bZ0J8m4lR5G8='
                            f = Fernet(mock_key)
                            encrypted_pii = f.encrypt(plaintext.encode('utf-8')).decode('utf-8')
                            pii_mapping[token] = encrypted_pii
                        except Exception:
                            pass
    except Exception as e:
        print(f"PII decode error: {e}")

    return {"reply": reply, "pii_mapping": pii_mapping}


def _get_context(user_id: str, question: str) -> str:
    """Pull context from Pinecone first, fallback to Postgres archive."""

    # Try Pinecone semantic search first
    pinecone_results = _query_pinecone(user_id, question)
    if pinecone_results:
        return pinecone_results

    # Fallback: pull latest 20 items from Postgres archive directly
    return _query_postgres(user_id)


def _query_pinecone(user_id: str, question: str) -> str:
    try:
        from pinecone import Pinecone
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        vec = model.encode(question).tolist()
        pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", ""))
        index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))
        results = index.query(
            vector=vec,
            filter={"user_id": user_id},
            top_k=8,
            namespace="founder_memory",
            include_metadata=True,
        )
        snippets = [
            f"[{m.metadata.get('source', 'unknown')}] {m.metadata.get('text', '')}"
            for m in results.matches
            if m.metadata.get("text")
        ]
        return "\n---\n".join(snippets) if snippets else ""
    except Exception:
        return ""


def _query_postgres(user_id: str) -> str:
    """Fallback: decrypt and return recent archive items from Postgres."""
    try:
        import uuid
        from sqlalchemy import create_engine, select
        from sqlalchemy.orm import Session
        from app.models.base import Base
        from app.models.user import User
        from app.models.archive import Archive
        from app.pipeline.encryption import decrypt

        db_url = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
        engine = create_engine(db_url)

        with Session(engine) as session:
            results = session.execute(
                select(Archive)
                .where(Archive.user_id == uuid.UUID(user_id))
                .order_by(Archive.ingested_at.desc())
                .limit(20)
            ).scalars().all()

        if not results:
            return "No emails or Slack messages found yet."

        snippets = []
        for item in results:
            try:
                content = decrypt(user_id, item.content_enc)
                snippets.append(f"[{item.source}] {content[:500]}")
            except Exception:
                pass

        return "\n---\n".join(snippets) if snippets else "No content available."
    except Exception as e:
        return f"Could not load context: {e}"
