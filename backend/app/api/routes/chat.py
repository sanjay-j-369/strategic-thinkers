from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, model_validator
import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from groq import Groq
from app.pipeline.pii import restore_pii_tokens, tokenize_pii
from app.security import resolve_user
from app.services.worker_directory import get_catalog_item

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    user_id: str | None = None
    message: str
    history: list[dict] = []
    system_prompt: str | None = None
    context_tags: list[str] = []
    worker_key: str | None = None
    # Accept camelCase from frontend too
    systemPrompt: str | None = Field(None, exclude=True)
    contextTags: list[str] | None = Field(None, exclude=True)
    workerKey: str | None = Field(None, exclude=True)

    @model_validator(mode="after")
    def merge_system_prompt(self) -> "ChatRequest":
        if self.system_prompt is None and self.systemPrompt is not None:
            self.system_prompt = self.systemPrompt
        if not self.context_tags and self.contextTags:
            self.context_tags = self.contextTags
        if self.worker_key is None and self.workerKey is not None:
            self.worker_key = self.workerKey
        return self


@router.post("")
async def chat(body: ChatRequest, request: Request):
    user = await resolve_user(request, user_id=body.user_id)
    client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

    # Run blocking context fetch in a thread pool so we don't block the event loop
    loop = asyncio.get_event_loop()
    context_tags = _resolve_context_tags(body.worker_key, body.context_tags)
    redacted_message, redacted_history, redacted_system_prompt, chat_pii_mapping = (
        _redact_chat_payload(body.message, body.history, body.system_prompt)
    )

    context = await loop.run_in_executor(None, _get_context, str(user.id), redacted_message, context_tags)
    system_content = _build_system_prompt(redacted_system_prompt, context, context_tags)

    messages = [{"role": "system", "content": system_content}]
    messages += redacted_history
    messages.append({"role": "user", "content": redacted_message})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
    )

    reply = response.choices[0].message.content
    return {"reply": restore_pii_tokens(reply or "", chat_pii_mapping)}


def _resolve_context_tags(worker_key: str | None, context_tags: list[str]) -> list[str]:
    if context_tags:
        return context_tags
    if not worker_key:
        return []

    item = get_catalog_item(worker_key)
    return list(item.tags) if item else []


def _redact_chat_payload(
    message: str,
    history: list[dict],
    system_prompt: str | None,
) -> tuple[str, list[dict], str | None, dict[str, str]]:
    redacted_message, chat_pii_mapping = tokenize_pii(message)
    redacted_history = []
    for item in history[-10:]:
        content = item.get("content") if isinstance(item, dict) else None
        role = item.get("role") if isinstance(item, dict) else None
        if role not in {"user", "assistant"} or not isinstance(content, str):
            continue
        redacted_content, item_mapping = tokenize_pii(content)
        chat_pii_mapping.update(item_mapping)
        redacted_history.append({"role": role, "content": redacted_content})

    redacted_system_prompt = None
    if system_prompt:
        redacted_system_prompt, system_mapping = tokenize_pii(system_prompt)
        chat_pii_mapping.update(system_mapping)
    return redacted_message, redacted_history, redacted_system_prompt, chat_pii_mapping


def _build_system_prompt(system_prompt: str | None, context: str, context_tags: list[str]) -> str:
    role = system_prompt or "You are a strategic AI advisor for founders."
    scope = f"\nRelevant memory tags: {', '.join(context_tags)}." if context_tags else ""
    return f"""{role}

You have direct access to the founder's recent emails, Slack messages, and worker memory shown below.{scope}
Answer questions specifically from this workspace context before giving general advice.
If the user asks for "latest updates", summarize the concrete current items, owners, risks, dates, and next actions from the context.
If context is missing or insufficient, say exactly what is missing instead of giving generic best practices.
If the user asks for a PDF, downloadable report, or file, write the report content only. Do not wrap it in <pdf> tags, do not say you cannot create files, and do not give copy/paste instructions; the client app will export the response as a real PDF.
ALWAYS preserve privacy tokens EXACTLY as they appear in the text. Do not modify or truncate them.

FOUNDER WORKSPACE CONTEXT:
{context}

Be direct and specific. Reference actual people, roles, and messages from the context above."""


def _get_context(user_id: str, question: str, context_tags: list[str] | None = None) -> str:
    """Pull fast redacted context for interactive chat.

    Chat is latency-sensitive because it runs through the frontend proxy. Prefer
    local Postgres archive reads and only use vector search as a final fallback.
    """
    context_tags = context_tags or []

    if context_tags:
        tagged_context = _query_postgres(user_id, context_tags=context_tags)
        if tagged_context:
            return tagged_context

    latest_context = _query_postgres(user_id)
    if latest_context:
        return latest_context

    pinecone_results = _query_pinecone(user_id, question)
    return pinecone_results or "No emails or Slack messages found yet."


def _query_tagged_memory(user_id: str, question: str, context_tags: list[str]) -> str:
    try:
        from app.agentic.context import query_memory_by_tags

        items = query_memory_by_tags(
            user_id,
            tags=context_tags,
            query_text=question,
            since_hours=24 * 14,
            top_k=12,
        )
        snippets = [
            f"[{item.get('source', 'unknown')}] {item.get('text', '')}"
            for item in items
            if item.get("text")
        ]
        return "\n---\n".join(snippets)
    except Exception:
        return ""


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


def _query_postgres(user_id: str, context_tags: list[str] | None = None) -> str:
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
                .limit(60 if context_tags else 20)
            ).scalars().all()

        if not results:
            return ""

        snippets = []
        for item in results:
            if context_tags:
                tags = item.context_tags or []
                if not any(tag in tags for tag in context_tags):
                    continue
            content = (item.content_redacted or "").strip()
            if content:
                snippets.append(f"[{item.source}] {content[:500]}")
            if len(snippets) >= 20:
                break

        return "\n---\n".join(snippets) if snippets else ""
    except Exception as e:
        return f"Could not load context: {e}"
