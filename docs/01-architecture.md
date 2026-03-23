# 01 — System Architecture

## Overview

The Founder Intelligence Engine is a **Distributed Event-Driven Pipeline** with four tiers.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  INGESTION TIER                                                         │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  Gmail       │  │  Slack       │  │  Google      │                  │
│  │  (polling)   │  │  (webhook)   │  │  Calendar    │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                  │                          │
│         └─────────────────┴──────────────────┘                         │
│                           │                                             │
│                     mode_router.py  ◄── INGESTION_MODE env var          │
│                    (real | simulate)                                     │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MESSAGE BUS                                                            │
│                                                                         │
│   Redis Queue  ──  Priority 1: ASSISTANT_PREP (meeting prep)            │
│                 ──  Priority 2: DATA_INGESTION / GUIDE_QUERY            │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PROCESSING TIER  ("The Brain")                                         │
│                                                                         │
│  consumer.py  branches on task_type:                                    │
│                                                                         │
│  DATA_INGESTION                ASSISTANT_PREP         GUIDE_QUERY       │
│  ─────────────                 ─────────────          ───────────       │
│  1. Strip PII (Presidio)       1. Pinecone            1. Pinecone       │
│  2. Encrypt raw (Fernet)          dual-filter            dual-query     │
│  3. Embed redacted text        2. GPT-4o synthesis    2. LangGraph      │
│  4. Upsert → Pinecone          3. Save Summary           reasoning      │
│  5. Save → Postgres archive    4. Push WebSocket      3. Push WebSocket │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
      ┌──────────────┐           ┌──────────────────┐
      │  Pinecone    │           │  PostgreSQL       │
      │  (vectors)   │           │  - archive        │
      │              │           │  - summary        │
      │  Namespaces: │           │  - startup_profile│
      │  founder_mem │           │  - users          │
      │  playbooks   │           └──────────────────┘
      └──────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DELIVERY TIER                                                          │
│                                                                         │
│  FastAPI  ──  REST API  ──►  Next.js 14                                 │
│           ──  WebSocket ──►  Real-time card feed                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tiers In Detail

### 1. Ingestion Tier
- **Real mode:** OAuth2 connections to Gmail, Slack, Google Calendar
- **Simulate mode:** Stub data generators — same queue contract, no credentials needed
- A `mode_router.py` feature-flag switches between the two at startup

### 2. Message Bus (Redis)
- Single queue with **priority lanes**
- Priority 1 → Meeting prep (time-sensitive, must fire ≤ 30 min before meeting)
- Priority 2 → General ingestion and guide queries (background, can lag)

### 3. Processing Tier — The Worker
`consumer.py` is the routing brain. It reads `task_type` from the payload and dispatches to one of three sub-pipelines:

| `task_type` | Pipeline |
|-------------|----------|
| `DATA_INGESTION` | PII strip → encrypt → embed → upsert Pinecone → archive Postgres |
| `ASSISTANT_PREP` | Dual-filter Pinecone query → GPT-4o synthesis → WebSocket push |
| `GUIDE_QUERY` | LangGraph 4-node reasoning loop → WebSocket push |

### 4. Delivery Tier
- **FastAPI** handles REST + WebSocket
- **WebSocket** pushes cards to the Next.js feed the moment they are generated
- **Redis Pub/Sub** bridges Celery worker processes → FastAPI WebSocket process

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single queue, priority lanes | Simpler ops than multiple queues; priority prevents meeting prep from lagging behind bulk ingestion |
| Per-user Fernet key | If one user's key leaks, no other user is compromised |
| Redacted-only embeddings | The AI model (OpenAI) never sees raw PII — only `<PERSON>`, `<EMAIL>` tokens |
| LangGraph over single prompt | Stateful multi-step reasoning needed for Guide; single prompt cannot self-correct or check red flags mid-flight |
| Simulator default | Developers can run the full pipeline on day one without any API keys |
