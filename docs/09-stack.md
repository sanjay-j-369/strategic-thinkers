# 09 — Tech Stack

## Full Stack Table

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| **Frontend Framework** | Next.js (App Router) | 14 | RSC for fast initial load; client components for real-time WebSocket feed; best-in-class DX |
| **Frontend Styling** | Tailwind CSS + Shadcn/UI | latest | Rapid, consistent UI; Shadcn gives accessible card/table primitives without a design opinion |
| **Auth** | Clerk | latest | Drop-in Google OAuth, handles session management, easy JWT validation in FastAPI middleware |
| **API Server** | FastAPI | 0.110+ | Native `async/await`, auto-generates OpenAPI docs, built-in `WebSocketEndpoint` |
| **Task Queue** | Celery + Redis | Celery 5 / Redis 7 | Industry standard for Python background tasks; priority queues built-in |
| **Scheduler** | Celery Beat | (bundled) | Cron-style periodic tasks for calendar polling — same Redis broker |
| **Message Broker** | Redis | 7 | Doubles as the Celery broker AND the pub/sub bridge between Celery workers and FastAPI WebSocket |
| **Database** | PostgreSQL | 16 | JSONB for flexible metadata, strong ACID guarantees for archive/summary tables |
| **ORM + Migrations** | SQLAlchemy + Alembic | 2.0 / 1.13 | Async-compatible ORM; Alembic for versioned schema migrations |
| **Privacy — PII Strip** | Microsoft Presidio | 2.x | Production-grade NLP-based PII detection; supports custom recognizers |
| **Privacy — Encryption** | cryptography (Fernet) | 42+ | AES-128-CBC with HMAC; simple API; per-user key derivation via HMAC-SHA256 |
| **Vector Database** | Pinecone | latest SDK | Managed, serverless; namespace support for `founder_memory` vs `startup_playbooks`; metadata filtering |
| **Embeddings** | OpenAI `text-embedding-3-small` | — | 1536-dim, cost-effective, strong semantic quality |
| **LLM** | OpenAI GPT-4o | — | Used for both Assistant synthesis and Guide reasoning nodes |
| **Reasoning Framework** | LangGraph | 0.1+ | Stateful multi-node graph — essential for the Guide's 5-step reasoning loop |
| **Secret Management** | AWS Secrets Manager / Doppler | — | Master Fernet key never in `.env`; runtime injection at container start |
| **Containerisation** | Docker + Docker Compose | latest | One-command local stack (Redis + Postgres + backend + Celery + frontend) |

---

## Dependency Map

```
Next.js 14
  └── Tailwind CSS
  └── Shadcn/UI
  └── Clerk (auth)
  └── Native WebSocket API

FastAPI
  └── Uvicorn (ASGI server)
  └── SQLAlchemy 2.0 (async)
  └── asyncpg (Postgres driver)
  └── Celery (task enqueueing)
  └── redis-py (pub/sub bridge)

Celery
  └── Redis (broker + result backend)
  └── Celery Beat (scheduler)
  └── presidio-analyzer + presidio-anonymizer
  └── cryptography
  └── openai
  └── pinecone-client
  └── langgraph
  └── google-auth + google-api-python-client
  └── slack_sdk
```

---

## Key Version Constraints

| Package | Minimum | Reason |
|---------|---------|--------|
| `langgraph` | 0.1.0 | Requires `StateGraph` API |
| `sqlalchemy` | 2.0 | Async session (`AsyncSession`) |
| `fastapi` | 0.110 | Lifespan context manager style |
| `openai` | 1.0 | New client interface (`openai.chat.completions.create`) |
| `celery` | 5.3 | Priority queue support stable |

---

## What Was Intentionally Left Out

| Tool | Reason Excluded |
|------|----------------|
| RabbitMQ | Redis is simpler to operate and already covers our priority queue needs |
| Kafka | Overkill for this scale; Kafka shines at millions of events/sec |
| Weaviate / Qdrant | Pinecone's managed serverless tier removes all infra overhead |
| LangChain | LangGraph supersedes it for stateful agentic flows; fewer abstractions |
| Pusher | FastAPI native WebSocket avoids an extra paid service + latency hop |
