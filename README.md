# Founder Intelligence Engine

A distributed, event-driven AI platform that gives founders a personal intelligence layer over Gmail, Slack, and Google Calendar.

## What It Does

| Mode | Name | Behaviour |
|------|------|-----------|
| **Assistant** | "The Context Weaver" | Proactively generates meeting prep briefs 30 min before a calendar event |
| **Guide** | "The Strategic Reasoning Engine" | Answers high-stakes questions using a multi-step LangGraph reasoning loop |

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Boot in simulator mode (no credentials needed)
make dev-sim

# 3. Visit the dashboard
open http://localhost:3000
```

## Architecture

```
[Gmail / Slack / Calendar]  OR  [Simulator]
              │
         Redis Queue
              │
        Celery Worker
         ┌────┴────┐
    PII Strip    Encrypt
         │           │
    [Pinecone]  [Postgres]
         │
   FastAPI + WS
         │
   Next.js Feed
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend (Next.js) | 3000 | Real-time intelligence feed |
| Backend (FastAPI) | 8001 | REST API + WebSocket |
| PostgreSQL | 5433 | Archive + summaries |
| Redis | 6379 | Queue + pub/sub |

## Modes

```bash
# Simulate (default — no credentials needed)
make dev-sim

# Live Google/Slack data
make dev-real

# Infra only (postgres + redis)
make infra-up
```

## Seed Knowledge Base

```bash
# Add markdown files to backend/data/playbooks/
# Then run:
python backend/scripts/seed_knowledge_base.py
```

## Run Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/
```

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + WebSocket
│   │   ├── config.py        # Settings (pydantic-settings)
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic event schema
│   │   ├── api/             # Routes + WebSocket manager
│   │   ├── ingestion/       # Gmail, Slack, Calendar + Simulator
│   │   ├── pipeline/        # PII, encryption, embedder, tagger
│   │   ├── assistant/       # Meeting prep RAG
│   │   ├── guide/           # LangGraph reasoning graph
│   │   └── workers/         # Celery app, beat schedule, consumer
│   └── tests/
├── frontend/
│   ├── app/                 # Next.js 14 App Router pages
│   ├── components/          # PrepCard, GuideCard, Feed, PrivacyTable
│   └── lib/                 # WebSocket hook
├── docker-compose.yml
└── .env.example
```
