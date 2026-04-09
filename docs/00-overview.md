# Founder Intelligence Engine — Documentation Index

> A distributed, event-driven AI platform that gives founders a personal intelligence layer over Gmail, Slack, and Google Calendar.

---

## What This System Does

The engine has two AI modes that run continuously in the background:

| Mode | Name | Behaviour |
|------|------|-----------|
| **Assistant** | "The Context Weaver" | Proactively generates meeting prep briefs 30 min before a calendar event — no founder action required. |
| **Guide** | "The Strategic Reasoning Engine" | Answers high-stakes questions ("Should I hire a CTO?") using a multi-step LangGraph reasoning loop that cross-references the founder's own data against a curated startup knowledge base. |

---

## Documentation Map

| File | Contents |
|------|----------|
| [`01-architecture.md`](./01-architecture.md) | System diagram, tiers, data flow |
| [`02-data-schema.md`](./02-data-schema.md) | Standardised JSON payload (the "queue contract") |
| [`03-privacy-pipeline.md`](./03-privacy-pipeline.md) | PII stripping (Presidio) + field-level encryption (Fernet) |
| [`04-assistant-rag.md`](./04-assistant-rag.md) | Meeting prep RAG flow — Celery Beat → Pinecone → LLM synthesis → WebSocket |
| [`05-guide-langgraph.md`](./05-guide-langgraph.md) | LangGraph reasoning graph — nodes, state, dual-query |
| [`06-simulator.md`](./06-simulator.md) | Dual-mode ingestion — `INGESTION_MODE=simulate` vs `real` |
| [`07-frontend.md`](./07-frontend.md) | Next.js 14 feed, real-time cards, Privacy Center |
| [`08-project-structure.md`](./08-project-structure.md) | Full monorepo file tree |
| [`09-stack.md`](./09-stack.md) | Tech stack table with rationale |
| [`10-current-state.md`](./10-current-state.md) | Current product/backend status and implementation notes |
| [`11-v2-implementation-plan.md`](./11-v2-implementation-plan.md) | Planned next-step implementation work |
| [`12-backend-reference.md`](./12-backend-reference.md) | Current backend architecture, worker flows, storage model, and full endpoint reference |

---

## One-Line Architecture

```
[Gmail / Slack / Calendar] ──► [Redis Queue] ──► [Celery Worker]
         OR                                            │
[Simulator (stub data)]                    ┌──────────┴────────────┐
                                     PII Strip            Encrypt Raw
                                           │                      │
                                    [Pinecone]              [Postgres]
                                    (clean vectors)         (archive)
                                           │
                                    [FastAPI + WS]
                                           │
                                    [Next.js Feed]
```

---

## Quick Start

```bash
# 1. Clone and enter
git clone <repo> && cd founders-helper

# 2. Copy env template
cp .env.example .env

# 3. Boot in simulator mode (no credentials needed)
docker compose up

# 4. Visit the dashboard
open http://localhost:3000
```

See [`10-current-state.md`](./10-current-state.md) for the current repo state and implementation summary.
