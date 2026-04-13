# Workflow Architecture: Demo vs. Actual Pipeline

This document explains in detail how the "Demo Workflow" operates, how it contrasts with the "Actual Workflow" (the core processing pipeline), and why these architectural distinctions exist in the Founders system.

## 1. Overview

The Founders application supports two parallel pipelines:
1. **Actual Workflow:** The robust, background-task-driven data processing pipeline that handles real user meetings, transcription analysis, data privacy (PII redaction), and asynchronous reporting.
2. **Demo Workflow:** A simulated, direct-execution pathway that mimics the actual workflow but operates synchronously or with mocked data to provide instant feedback without requiring a full end-to-end data integration (like waiting for a real Zoom meeting to end).

## 2. The Actual Workflow (Production)

The production pipeline is designed for high reliability, asynchronous processing, and strict data privacy. It relies on Celery, LangGraph, and various AI models.

### Step-by-Step Execution
1. **Data Ingestion:** A webhook from a meeting provider (e.g., Zoom, Google Meet) or an integration service triggers an ingestion endpoint.
2. **Task Enqueueing:** The ingestion endpoint does *not* process the data immediately. Instead, it creates a database record and pushes a task to a **Celery message queue**.
3. **Background Processing (Celery Worker):**
   - **Transcription & Sync:** The raw meeting audio/video is transcribed.
   - **Privacy Filtering (PII):** The transcript is passed through Microsoft Presidio and customized LLM detectors to identify and redact Personally Identifiable Information (PII) like names, emails, and phone numbers.
   - **Structured Extraction:** A LangGraph agent parses the redacted transcript to extract actionable insights, tasks, and summaries based on the user's defined schema.
4. **Data Persistence & Vectorization:** The extracted entities are saved to the relational database (PostgreSQL via SQLAlchemy) and embedded into a vector database (Pinecone) for semantic search via the RAG (Retrieval-Augmented Generation) assistant.
5. **Real-time Notification:** A WebSocket event is dispatched to the frontend to notify the user that processing is complete.

## 3. The Demo Workflow (Simulation)

The demo workflow exists to showcase the product's capabilities instantly to new users, investors, or during local development. It skips the time-consuming steps of real meeting ingestion and asynchronous queue waits.

### Step-by-Step Execution
1. **User Initiation:** The user clicks a "Start Demo" or "Trigger Simulation" button on the frontend (/app/demo or via the Target User ID snippet).
2. **Synchronous or Fast-Tracked Mocking:**
   - Instead of waiting for a webhook, the backend loads a **pre-configured seed transcript** or a controlled input string.
3. **Pushed Task or Direct Run:**
   - In some demo modes, the code directly invokes the pipeline functions (e.g., `process_transcript(mock_text)`) synchronously to return immediate HTTP responses.
   - It may bypass Celery entirely, running the LangGraph agent in the same request loop so the frontend can display a loading spinner and get results in seconds.
4. **Controlled PII & Extraction:** The demo uses specific, hardcoded PII examples (like "John Doe, johndoe@example.com") to guarantee the Presidio regex matchers fire correctly, showcasing the privacy scrubber reliably.
5. **State Reset:** Demo mode often writes to temporary tables or isolates the generated data to a specific `demo_user_id` so it can be easily wiped, ensuring the database doesn't bloat with mock data.

## 4. Key Differences

| Feature | Actual Workflow | Demo Workflow |
| :--- | :--- | :--- |
| **Trigger Mechanism** | External Webhooks (Zoom/Meet integration) | Manual UI Button / API Endpoint `/api/demo` |
| **Execution Model** | Asynchronous (Celery + Redis) | Synchronous / Direct Function Calls |
| **Data Source** | Real meeting audio / third-party API | Seed data, Mocked transcripts, Hardcoded text |
| **Processing Time** | Minutes (depends on audio length) | Seconds (instant feedback) |
| **Privacy (PII)** | Detects unknown, dynamic PII in real-time | Uses curated PII string to ensure 100% demo success |
| **State Management** | Persistent, immutable records | Ephemeral, isolated, often associated with a `demo_user` |

## 5. Connecting the UI to the Demo

On the frontend dashboard (`app/page.tsx`), the "Queue Mix" component has been replaced with a **Target User ID** block. 
This provides developers and users with the specific `user_id` identifier required to trigger demo CLI scripts (like `demo/trigger_fake_meeting.sh`) and route the mocked data properly so it appears on the active user's screen via WebSockets.