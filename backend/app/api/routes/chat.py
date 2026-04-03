from fastapi import APIRouter, Request
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from groq import Groq
from app.security import resolve_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    user_id: str | None = None
    message: str
    history: list[dict] = []


@router.post("")
async def chat(body: ChatRequest, request: Request):
    user = await resolve_user(request, user_id=body.user_id)
    client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

    context = _get_context(str(user.id), body.message)

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
    return {"reply": reply}


def _get_context(user_id: str, question: str) -> str:
    """Pull context from Pinecone first, fallback to redacted Postgres archive."""

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
    """Fallback: return recent redacted archive items from Postgres."""
    try:
        import uuid
        from sqlalchemy import create_engine, select
        from sqlalchemy.orm import Session
        from app.models.archive import Archive

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
            content = (item.content_redacted or "").strip()
            if content:
                snippets.append(f"[{item.source}] {content[:500]}")

        return "\n---\n".join(snippets) if snippets else "No content available."
    except Exception as e:
        return f"Could not load context: {e}"
