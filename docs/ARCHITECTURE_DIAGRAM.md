# High-Level Architecture Diagram

## End-to-End Tech Stack

```mermaid
graph TB
    subgraph Frontend["🎨 Frontend Layer"]
        NextJS["Next.js 14<br/>Tailwind CSS<br/>Shadcn/UI<br/>WebSocket Client"]
        Clerk["Clerk Auth<br/>OAuth2"]
    end

    subgraph Ingestion["📥 Ingestion Layer"]
        Gmail["Gmail<br/>Polling"]
        Slack["Slack<br/>Webhooks"]
        Calendar["Google Calendar<br/>Sync"]
    end

    subgraph Orchestration["🎯 Orchestration & Message Bus"]
        Redis["Redis 7<br/>Priority Queue<br/>Pub/Sub"]
        Celery["Celery 5<br/>Task Queue<br/>Beat Scheduler"]
    end

    subgraph Processing["🧠 Processing & LLM Layer"]
        Workers["Celery Workers"]
        Presidio["Presidio<br/>PII Detection"]
        Encryption["Cryptography<br/>Fernet Encryption"]
        LangGraph["LangGraph<br/>Reasoning Graphs"]
        GPT4["GPT-4o<br/>Model API"]
        Embeddings["OpenAI<br/>Embeddings<br/>text-embedding-3-small"]
    end

    subgraph Memory["💾 Memory & Persistence Layer"]
        Pinecone["Pinecone<br/>Vector DB<br/>Semantic Search"]
        Postgres["PostgreSQL 16<br/>SQLAlchemy ORM<br/>Archive & Summary<br/>User Data"]
    end

    subgraph API["⚙️ API Server"]
        FastAPI["FastAPI<br/>REST + WebSocket<br/>Async/Await"]
    end

    %% Connections
    Ingestion -->|Data Event| Redis
    Redis -->|Task Dispatch| Celery
    Celery -->|Worker Lease| Workers
    
    Workers -->|Strip PII| Presidio
    Presidio -->|Encrypt| Encryption
    Encryption -->|Embed| Embeddings
    
    Workers -->|Query Memory| Pinecone
    Workers -->|Query Context| Postgres
    
    Workers -->|Reasoning| LangGraph
    LangGraph -->|API Call| GPT4
    GPT4 -->|Response| Workers
    
    Workers -->|Save Result| Postgres
    Workers -->|Upsert Vector| Pinecone
    Workers -->|Publish Event| Redis
    
    Redis -->|WebSocket Update| FastAPI
    FastAPI -->|Render Feed| NextJS
    
    NextJS -->|Request| FastAPI
    FastAPI -->|Query| Postgres
    FastAPI -->|Search| Pinecone
    
    NextJS -->|Login| Clerk
    Clerk -->|Validate| FastAPI

    %% Styling
    classDef frontend fill:#e1f5ff,stroke:#01579b,stroke-width:2px,color:#111111
    classDef ingestion fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#111111
    classDef orchestration fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#111111
    classDef processing fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,color:#111111
    classDef memory fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#111111
    classDef api fill:#f1f8e9,stroke:#33691e,stroke-width:2px,color:#111111

    class NextJS,Clerk,Frontend frontend
    class Gmail,Slack,Calendar,Ingestion ingestion
    class Redis,Celery,Orchestration orchestration
    class Workers,Presidio,Encryption,LangGraph,GPT4,Embeddings,Processing processing
    class Pinecone,Postgres,Memory memory
    class FastAPI,API api
```

---

## Layer Descriptions

### 📥 **Ingestion Layer**
- **Gmail Polling**: Monitors inbox for meeting invites and messages
- **Slack Webhooks**: Real-time channel and DM ingestion
- **Google Calendar**: Syncs events and extracts attendees
- Routes all events → Redis Priority Queue

### 🎯 **Orchestration & Message Bus**
- **Redis**: Single queue with priority lanes
  - Priority 1: Meeting prep (time-critical)
  - Priority 2: General ingestion & guide queries
  - Also serves as pub/sub bridge for WebSocket updates
- **Celery**: Background task runner with Beat scheduler for periodic polls

### 🧠 **Processing & LLM Layer**
- **Celery Workers**: Lease and execute tasks
- **Presidio**: NLP-based PII detection (emails, names, SSNs, phones)
- **Cryptography (Fernet)**: Per-user symmetric encryption of sensitive data
- **Embeddings**: OpenAI text-embedding-3-small for semantic search
- **LangGraph**: Stateful multi-node reasoning graphs for complex workflows
- **GPT-4o**: Primary LLM for synthesis, analysis, and decision-making

### 💾 **Memory & Persistence Layer**
- **Pinecone**: Vector database (managed, serverless)
  - Stores redacted embeddings
  - Enables semantic search by tags and metadata
  - Namespaces: `founder_memory`, `startup_playbooks`
- **PostgreSQL**: Structured data and archives
  - User accounts and auth
  - Raw encrypted content
  - Meeting summaries and prep cards
  - Promise tracking and agent runs

### ⚙️ **API Server**
- **FastAPI**: Async REST + WebSocket endpoints
  - Handles auth validation (via Clerk)
  - Queries memory and persistence layers
  - Pushes real-time updates to frontend

### 🎨 **Frontend Layer**
- **Next.js 14**: React with server components
- **Tailwind + Shadcn/UI**: Fast, accessible UI components
- **Clerk**: OAuth2 login and session management
- **WebSocket Client**: Real-time feed updates

---

## Data Flow Example: Meeting Prep

1. **Ingestion**: Google Calendar → Gmail event → Redis queue (Priority 1)
2. **Orchestration**: Celery leases task from Redis
3. **Processing**:
   - PII is stripped (names → `<PERSON_xxx>`, emails → `<EMAIL_xxx>`)
   - Redacted content is embedded
   - Semantic search queries Pinecone for related context
   - GPT-4o synthesizes a prep card
4. **Memory**: Result saved to Postgres; embeddings upserted to Pinecone
5. **Delivery**: Redis pub/sub → FastAPI → WebSocket → Next.js feed
6. **Frontend**: Founder sees prep card in real-time

---

## Security by Layer

| Layer | Protection |
|-------|-----------|
| **Ingestion** | OAuth2 credentials, webhook validation |
| **Processing** | PII detection & tokenization before LLM |
| **Memory** | Per-user Fernet encryption; raw content stored encrypted; vectors only redacted |
| **API** | JWT validation, role-based access control |
| **Frontend** | Session-based auth, private key material never sent to server |

---

## Deployment Model

- **Local Dev**: `docker-compose` (Redis, Postgres, FastAPI, Celery, Next.js)
- **Production**: Containerized services on Kubernetes or serverless
  - Redis: Managed (AWS ElastiCache or Redis Cloud)
  - Postgres: Managed (RDS or DigitalOcean)
  - Pinecone: Managed serverless (no ops required)
  - FastAPI + Celery: Container orchestration (K8s, ECS, or App Engine)
  - Next.js: Static hosting (Vercel, CloudFront) or container

---

## Why This Stack?

- **Scalability**: Redis + Celery handle priority queueing; Pinecone is infinitely scalable
- **Real-time**: WebSocket integration for instant card delivery
- **Security**: Encryption at rest, PII tokenization, per-user keys
- **Developer Experience**: Python async/await, auto OpenAPI docs, fast iteration
- **Cost**: Managed services (Pinecone, Clerk) reduce ops overhead

