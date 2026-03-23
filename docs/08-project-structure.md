# 08 — Project Structure

Full monorepo file tree for the Founder Intelligence Engine.

```
founders-helper/
│
├── docs/                                    ← You are here
│   ├── 00-overview.md
│   ├── 01-architecture.md
│   ├── 02-data-schema.md
│   ├── 03-privacy-pipeline.md
│   ├── 04-assistant-rag.md
│   ├── 05-guide-langgraph.md
│   ├── 06-simulator.md
│   ├── 07-frontend.md
│   ├── 08-project-structure.md
│   ├── 09-stack.md
│   ├── 10-local-dev.md
│   └── 11-verification.md
│
├── backend/
│   ├── app/
│   │   ├── main.py                          ← FastAPI app + WebSocket endpoint
│   │   ├── config.py                        ← Pydantic Settings (reads .env)
│   │   │
│   │   ├── models/                          ← SQLAlchemy ORM
│   │   │   ├── base.py
│   │   │   ├── user.py
│   │   │   ├── startup_profile.py           ← MRR, burn, headcount, stage
│   │   │   ├── archive.py                   ← Encrypted raw content (cold storage)
│   │   │   └── summary.py                   ← Generated prep/guide cards
│   │   │
│   │   ├── schemas/                         ← Pydantic request/response schemas
│   │   │   └── events.py                    ← FounderEvent (the queue contract)
│   │   │
│   │   ├── api/
│   │   │   ├── ws.py                        ← WebSocket connection manager
│   │   │   └── routes/
│   │   │       ├── auth.py                  ← OAuth connect / disconnect
│   │   │       ├── summaries.py             ← GET /api/summaries
│   │   │       ├── guide.py                 ← POST /api/guide (enqueue GUIDE_QUERY)
│   │   │       └── privacy.py               ← GET/DELETE /api/archive/{id}
│   │   │
│   │   ├── ingestion/                       ← Data ingestion workers
│   │   │   ├── gmail.py                     ← Real Gmail OAuth2 poller
│   │   │   ├── slack.py                     ← Real Slack webhook handler
│   │   │   ├── calendar.py                  ← Real Google Calendar Celery task
│   │   │   ├── mode_router.py               ← Feature flag: real | simulate
│   │   │   └── simulator/
│   │   │       ├── __init__.py
│   │   │       ├── config.py                ← Tweakable knobs (SimulatorConfig)
│   │   │       ├── fixtures.py              ← Fake emails, Slack msgs, meetings
│   │   │       ├── gmail_sim.py             ← Fake email emitter
│   │   │       ├── slack_sim.py             ← Fake Slack message emitter
│   │   │       └── calendar_sim.py          ← Fake calendar event emitter
│   │   │
│   │   ├── pipeline/                        ← Core data processing
│   │   │   ├── pii.py                       ← Microsoft Presidio PII stripper
│   │   │   ├── encryption.py                ← Fernet encrypt/decrypt helpers
│   │   │   ├── embedder.py                  ← OpenAI embed → Pinecone upsert
│   │   │   └── tagger.py                    ← Auto-tag context_tags from content
│   │   │
│   │   ├── assistant/
│   │   │   └── meeting_prep.py              ← Dual-filter RAG + GPT-4o synthesis
│   │   │
│   │   ├── guide/
│   │   │   ├── graph.py                     ← LangGraph state machine (compiled)
│   │   │   └── nodes.py                     ← 5 reasoning node implementations
│   │   │
│   │   └── workers/
│   │       ├── celery_app.py                ← Celery + Redis config
│   │       ├── beat_schedule.py             ← Periodic tasks (mode-aware)
│   │       └── consumer.py                  ← Main worker — routes on task_type
│   │
│   ├── alembic/                             ← DB migrations
│   │   ├── env.py
│   │   └── versions/
│   │
│   ├── data/
│   │   └── playbooks/                       ← Source PDFs/markdown for KB seeding
│   │       ├── pg_essays/
│   │       └── yc_library/
│   │
│   ├── scripts/
│   │   └── seed_knowledge_base.py           ← One-time Pinecone KB loader
│   │
│   ├── tests/
│   │   ├── test_pii.py
│   │   ├── test_pipeline.py
│   │   └── test_guide.py
│   │
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                         ← Real-time feed (/)
│   │   ├── guide/
│   │   │   └── page.tsx                     ← Guide chat (/guide)
│   │   └── privacy/
│   │       └── page.tsx                     ← Privacy Center (/privacy)
│   │
│   ├── components/
│   │   ├── PrepCard.tsx                     ← Amber meeting prep card
│   │   ├── GuideCard.tsx                    ← Indigo strategic insight card
│   │   ├── Feed.tsx                         ← Animated card list
│   │   └── PrivacyTable.tsx                 ← Paginated archive table
│   │
│   ├── lib/
│   │   └── websocket.ts                     ← useFounderFeed() hook
│   │
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Python modules | `snake_case` | `meeting_prep.py` |
| Python classes | `PascalCase` | `GmailSimulator` |
| Celery task names | `SCREAMING_SNAKE_CASE` string | `"poll_calendar_simulated"` |
| Pinecone namespaces | `snake_case` | `startup_playbooks` |
| TypeScript components | `PascalCase` | `PrepCard.tsx` |
| Env vars | `SCREAMING_SNAKE_CASE` | `INGESTION_MODE` |
