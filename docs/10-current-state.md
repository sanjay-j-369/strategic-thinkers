# Current State of the Founder Intelligence Engine

> **Last Updated:** April 2026

This document provides a comprehensive overview of the current state, functionality, architecture, and operational details of the Founder Intelligence Engine. It serves as a single source of truth for understanding what the system does, how it works under the hood, and its current capabilities.

---

## 1. Executive Summary

The **Founder Intelligence Engine** is a distributed, event-driven AI platform designed to act as a personal intelligence layer for startup founders. It integrates deeply with a founder's communication and scheduling tools (Gmail, Slack, Google Calendar) to provide proactive insights and strategic reasoning.

The system is built around a paramount directive: **Data Privacy**. Before any data touches an LLM, it passes through a rigorous clean-room pipeline that strips Personally Identifiable Information (PII) and encrypts raw data at the field level.

### Core Modes of Operation

The engine operates autonomously through two continuously running AI modes:

1.  **The Assistant ("The Context Weaver"):** A time-triggered Retrieval-Augmented Generation (RAG) system. It anticipates the founder's needs by monitoring their calendar. Thirty minutes before any external meeting, it cross-references attendees and topics against the founder's encrypted history, synthesizes the context, and pushes a prioritized briefing card to the frontend. No manual interaction is required.
2.  **The Guide ("The Strategic Reasoning Engine"):** An on-demand, multi-step LangGraph reasoning agent. When faced with high-stakes, ambiguous questions (e.g., "Should I hire a CTO?"), it doesn't just provide a generic LLM response. It executes a strategic reasoning loop: fetching the founder's live metrics (burn rate, MRR, stage), cross-referencing this against a curated startup knowledge base, running rule-based red-flag checks, and outputting a structured, actionable decision framework.

---

## 2. System Architecture & Data Flow

The architecture is deliberately decoupled, utilizing a message bus to handle asynchronous processing and ensure that time-sensitive tasks (like meeting prep) are not blocked by bulk data ingestion.

### The Four Tiers

#### 1. Ingestion Tier
This tier connects to external data sources. It operates in two modes controlled by the `INGESTION_MODE` environment variable:
*   **Real Mode:** Uses OAuth2 and webhooks to connect to live Gmail, Slack, and Google Calendar accounts.
*   **Simulate Mode:** Generates realistic stub data matching the system's payload contracts. This is the default for local development, allowing engineers to work on the full pipeline without requiring live API keys.

Data from these sources is packaged into a standardized JSON payload and pushed to the message bus.

#### 2. Message Bus (Redis Queue)
Redis acts as the central nervous system, utilizing priority queues:
*   **Priority 1:** `ASSISTANT_PREP` (Meeting prep tasks that must execute immediately before a meeting).
*   **Priority 2:** `DATA_INGESTION` (Background syncing of emails/messages) and `GUIDE_QUERY` (User-initiated strategic queries).

#### 3. Processing Tier ("The Brain")
Celery workers consume tasks from Redis and route them based on the `task_type`:
*   **Data Ingestion Pathway:**
    1.  **PII Stripping (Microsoft Presidio):** Replaces sensitive entities with tokens (e.g., `John Doe` -> `<PERSON>`, `555-0199` -> `<PHONE_NUMBER>`).
    2.  **Field-Level Encryption (Fernet):** Encrypts the raw text using a per-user AES-128-CBC derived key. The key is managed securely and ensures that if one user's data is compromised, others remain safe.
    3.  **Embedding (OpenAI):** Generates vector embeddings for the *redacted* text only. OpenAI never receives raw PII.
    4.  **Vector Storage (Pinecone):** Upserts the vector into the `founder_memory` namespace.
    5.  **Archival Storage (PostgreSQL):** Saves the *encrypted* raw content to a Postgres archive table for user access via the Privacy Center.
*   **Assistant Prep Pathway:** Executes duplicate Pinecone queries (filtering by attendees and topic), synthesizes a prep card using GPT-4o, and pushes the result to the delivery tier.
*   **Guide Query Pathway:** Triggers the 5-node LangGraph state machine (fetch profile -> query knowledge base -> cross-reference -> check red flags -> generate decision framework).

#### 4. Delivery Tier
A FastAPI backend serves as the bridge between the processing tier and the client. It handles REST API calls and maintains persistent WebSocket connections. When a Celery worker completes a prep card or guide response, it broadcasts the payload via Redis Pub/Sub to the FastAPI WebSocket manager, which instantly pushes the Native UI card to the Next.js frontend.

---

## 3. Technology Stack

The stack is optimized for AI integration, real-time updates, and robust data processing.

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14, React, Tailwind CSS, Shadcn/UI | App Router for fast initial load; Client components handle the real-time card stream. |
| **Backend API** | FastAPI (Python 3.11+) | Asynchronous by design, perfect for WebSockets and rapid API prototyping. |
| **Task Queue / Worker** | Celery & Redis | Robust asynchronous task processing with priority support. Redis handles both queuing and Pub/Sub for WebSockets. |
| **Database (Relational)** | PostgreSQL | Stores user profiles, encrypted raw archives, and generated summaries. |
| **Database (Vector)** | Pinecone | Fast semantic search across two namespaces: `founder_memory` (internal) and `startup_playbooks` (external). |
| **Privacy / Encryption** | Microsoft Presidio, Cryptography (Fernet) | Enterprise-grade PII detection and field-level encryption. |
| **LLM & Embeddings** | OpenAI (`gpt-4o`, `text-embedding-3-small`) | State-of-the-art models for synthesis and vectorization. |
| **Reasoning Engine** | LangGraph | Stateful, multi-actor LLM orchestration for complex decision trees. |
| **Infrastructure** | Docker, Docker Compose | Containerized local environment mapping frontend to `3001` and backend to `8001`. |

---

## 4. Current Implementation Status & Capabilities

### ✅ Fully Implemented Features
1.  **Dockerized Local Environment:** The system runs reliably using `docker-compose.yml`, mapping Next.js to port `3001` and FastAPI to port `8001` to avoid common local port conflicts.
2.  **Dual Ingestion Modes:** The `mode_router.py` accurately switches between simulated data and real OAuth data based on the `.env` file configuration.
3.  **The Privacy Pipeline:**
    *   Presidio successfully identifies and blanks out custom entities within incoming text.
    *   Fernet derives unique keys per user and encrypts raw payloads in PostgreSQL.
    *   Only PII-scrubbed data is sent to OpenAI for embedding.
4.  **The Assistant (Meeting Prep):**
    *   Celery Beat correctly schedules and polls calendar events.
    *   The retrieval system successfully executes dual-filtered Pinecone queries.
    *   GPT-4o successfully generates structured "Prep Cards".
5.  **The Guide (LangGraph):**
    *   The 5-node graph accurately progresses through profile loading, vector retrieval, cross-referencing, red-flag checking, and final generation.
    *   Hardcoded heuristics successfully trigger warnings based on runway, MRR, and spend metrics.
6.  **Real-Time Frontend:**
    *   WebSockets are integrated successfully. Cards stream into the central Next.js feed instantly upon Celery task completion.
    *   The Privacy Center allows users to view decrypted data on-demand or permanently "Forget" (delete from Postgres and Pinecone).

### 🔄 Active Development & Integrations
*   **Google OAuth Verification:** The application is currently in the "Testing" phase within the Google Cloud Console. Access requires manual addition of test users (e.g., `saggb131@gmail.com`) to bypass the `Error 403: access_denied` during the Next.js sign-in flow.
*   **Manual Ingestion Overlay:** A configuration flag (`NEXT_PUBLIC_ALLOW_MANUAL_INGESTION`/`ALLOW_MANUAL_INGESTION`) was recently introduced to allow the UI to display manual ingestion forms even when operating in "real" mode, facilitating easier testing and onboarding.

---

## 5. Summary of the User Experience

1.  **Onboarding:** The founder connects their Google and Slack accounts. Background workers immediately begin indexing and securing their historical data.
2.  **Passive Value (The Feed):** The founder leaves the dashboard open. Throughout the day, as meetings approach, amber-accented "Prep Cards" slide into the feed, summarizing what was last discussed and suggesting a goal for the call.
3.  **Active Value (The Guide):** When facing a critical decision, the founder asks the Guide via chat. An indigo-accented "Strategic Insight" card is generated, providing not just an answer, but an analysis that compares the founder's specific metrics against top-tier startup playbooks, highlights critical risks, and provides a clear 3-step action plan.
4.  **Trust & Control:** At any point, the founder can navigate to the Privacy Center, inspect the raw encrypted data the system holds, and selectively delete entities from the system entirely.
