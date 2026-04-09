# 12 - Backend Architecture and Endpoint Reference

This document describes the backend as it is currently implemented in `backend/app/`.

It is intended to answer four questions:

1. What processes make up the backend.
2. How data moves through the system.
3. What each persistence layer stores.
4. What every HTTP and WebSocket endpoint does.

## 1. Backend at a Glance

The backend is not a single process. It is a set of cooperating runtime pieces:

- `FastAPI` serves REST endpoints, owns the async SQLAlchemy session factory, and manages WebSocket clients.
- `Redis` is used in two ways:
  - as the Celery broker/result backend
  - as the pub/sub bridge from workers to FastAPI WebSocket clients
- `Celery workers` execute ingestion, guide, prep, and threshold tasks asynchronously.
- `Celery Beat` triggers scheduled polling and threshold evaluation jobs.
- `PostgreSQL` stores users, archive records, summaries, startup profiles, and encrypted PII mappings.
- `Pinecone` stores vectorized redacted memory for retrieval.
- `Groq` is used for LLM-based synthesis and meeting detection.
- `sentence-transformers` generates local embeddings with `all-MiniLM-L6-v2`.

## 2. Runtime Components

### 2.1 FastAPI App

The FastAPI entrypoint is `backend/app/main.py`.

On startup, the app:

- creates an async SQLAlchemy engine using `settings.DATABASE_URL`
- runs `Base.metadata.create_all(...)`
- applies a small set of `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` compatibility migrations for:
  - extra `users` columns
  - `summaries.source_ref`
  - `archive.content_redacted`
  - `archive.pii_tokens`
- stores `async_sessionmaker(...)` on `app.state.async_session`
- bootstraps the demo persona if `DEMO_MODE=true`
- opens a Redis pub/sub subscription on `founder:*`
- forwards pub/sub messages to connected WebSocket clients through `app.api.ws.manager`

On shutdown, it cancels the Redis listener and disposes both Redis and the database engine.

### 2.2 WebSocket Delivery

The WebSocket manager in `backend/app/api/ws.py` keeps a simple in-memory map:

- key: `user_id`
- value: active `WebSocket`

Workers never talk to WebSockets directly. They publish JSON to Redis channel `founder:{user_id}`. FastAPI subscribes to those channels and forwards the payload to the matching connected user.

This means the delivery path is:

`Celery worker -> Redis pub/sub -> FastAPI listener -> WebSocket client`

### 2.3 Celery App

The Celery app is defined in `backend/app/workers/celery_app.py`.

Important configuration:

- broker/backend: `REDIS_URL`
- UTC enabled
- queue priorities enabled
- worker pool: `solo`
- scheduled tasks loaded from `backend/app/workers/beat_schedule.py`

Included task modules:

- `app.workers.consumer`
- `app.workers.real_ingestion`
- `app.workers.thresholds`
- `app.ingestion.calendar`
- `app.ingestion.simulator.calendar_sim`

### 2.4 Celery Beat Schedule

Beat scheduling is controlled by `INGESTION_MODE`.

Always scheduled:

- `poll-calendar` every 15 minutes
- `evaluate-founder-thresholds` daily at 06:00 UTC

Only in `INGESTION_MODE=real`:

- `poll_gmail_real` every 10 minutes
- `poll_slack_real` every 5 minutes

### 2.5 Ingestion Modes

The system supports two ingestion modes in `backend/app/ingestion/mode_router.py`:

- `simulate`
  - uses fake Gmail, Slack, and Calendar event generators
- `real`
  - uses Google APIs and Slack APIs

The simulator exists so the same event contract and worker pipeline can be exercised without live integrations.

## 3. Core Data Model

### 3.1 `users`

Model: `backend/app/models/user.py`

Stores:

- identity: `id`, `email`, `full_name`
- local auth: `password_hash`
- Google integration state: `google_token`, `google_last_synced_at`
- Slack integration state: `slack_token`, `slack_team_id`, `slack_channel_ids`, `slack_last_synced_at`
- creation timestamp

Notes:

- Google and Slack tokens are stored encrypted.
- `slack_channel_ids` is stored as JSON text, not a normalized relation.

### 3.2 `archive`

Model: `backend/app/models/archive.py`

Stores one archived communication item per ingested event:

- `content_enc`: encrypted raw content
- `content_redacted`: PII-redacted text
- `source`: `GMAIL`, `SLACK`, etc.
- `context_tags`: extracted or supplied tags
- `pii_tokens`: tokens inserted into the redacted text
- `ingested_at`

This table is the durable source for the Privacy Center and the chat fallback path.

### 3.3 `pii_vault`

Model: `backend/app/models/pii_vault.py`

Stores token-to-encrypted-value mappings:

- `token`
- `encrypted_value`
- `user_id`

When content is redacted into placeholders like `<PHONE_NUMBER_ab12cd>`, the encrypted original value is stored here so the app can preserve privacy while still allowing later controlled inspection.

### 3.4 `summaries`

Model: `backend/app/models/summary.py`

Used for multiple output types:

- `MEETING`
- `ASSISTANT_PREP`
- `GUIDE_QUERY`
- `GUIDE_MILESTONE`

Fields:

- `topic`
- `source_ref`
- `summary_text`
- `generated_at`

Important detail:

- some rows contain plain text in `summary_text`
- some rows contain JSON serialized as a string
- the `/api/summaries` endpoint attempts to parse JSON-looking values into `payload`

### 3.5 `startup_profiles`

Model: `backend/app/models/startup_profile.py`

Stores founder/company metrics used by the Guide and threshold evaluator:

- `stage`
- `mrr_usd`
- `burn_rate_usd`
- `runway_months`
- `headcount`
- `has_cto`
- `dev_spend_pct`

## 4. Authentication and User Resolution

Authentication is implemented in `backend/app/security.py`.

### 4.1 Session Token Format

The backend does not use JWT libraries. It builds a custom signed token:

- payload: base64url-encoded JSON with `sub`, `email`, `exp`
- signature: HMAC-SHA256 over the encoded payload
- final format: `<payload>.<signature>`

### 4.2 Password Storage

Passwords use PBKDF2-HMAC-SHA256 with:

- 390,000 iterations
- random 16-byte salt

Stored format:

`<salt_b64>$<digest_b64>`

### 4.3 Request-Time User Resolution

There are three user resolution patterns used by the routes:

- `require_current_user(request)`
  - requires `Authorization: Bearer <token>`
  - in demo mode, may auto-resolve to the demo user if no bearer token is present
- `resolve_user(request, user_id=..., required=True)`
  - prefers the authenticated bearer user
  - falls back to explicit `user_id`
  - raises `401` or `404` if necessary
- `get_optional_current_user(request)`
  - returns `None` if no authenticated or demo user is available

This means several endpoints are usable either:

- as a signed-in user with a bearer token, or
- by passing a `user_id` directly

That dual behavior is important for simulator/demo flows and some frontend integration paths.

## 5. Privacy and Storage Pipeline

The data-ingestion worker path is implemented in `backend/app/workers/consumer.py`.

### 5.1 Event Contract

All worker tasks consume the `FounderEvent` schema from `backend/app/schemas/events.py`.

Top-level fields:

- `metadata`
  - `user_id`
  - `trace_id`
  - `timestamp`
- `task_type`
  - `DATA_INGESTION`
  - `ASSISTANT_PREP`
  - `GUIDE_QUERY`
- `payload`
  - source, raw/redacted content, tags, entities, topic, source ids/urls, action-item flag

### 5.2 `DATA_INGESTION` Flow

`process_founder_event(...)` routes `DATA_INGESTION` into `_handle_data_ingestion(...)`.

Exact processing order:

1. Load `content_raw` from the event.
2. Run `strip_pii(...)` from `backend/app/pipeline/pii.py`.
3. Encrypt the raw content with `encrypt(user_id, content_raw)`.
4. Resolve tags:
   - use event-provided tags if present
   - otherwise derive them with `extract_tags(...)`
5. Upsert the redacted text to Pinecone namespace `founder_memory`.
6. Save archive row in Postgres.
7. Save token-to-encrypted-value mappings in `pii_vault` if PII was found.
8. Run LLM-based meeting detection on the redacted content.
9. If a meeting is detected, save a `MEETING` summary row.

### 5.3 PII Redaction

`backend/app/pipeline/pii.py` uses:

- `presidio_analyzer.AnalyzerEngine`
- `presidio_anonymizer.AnonymizerEngine`

Implementation behavior:

- detects PII entities in the text
- filters overlapping spans by preferring earlier/longer matches
- replaces each entity with a token like `<ENTITYTYPE_abc123>`
- encrypts the original entity value with the per-user encryption key
- returns:
  - the redacted text
  - a mapping of token -> encrypted original value

Fallback behavior:

- on error it prints a warning and returns the original text
- if `user_id` is missing it only returns anonymized text and skips token mapping

### 5.4 Encryption

`backend/app/pipeline/encryption.py` derives a per-user Fernet key from:

- `MASTER_FERNET_KEY`
- `user_id`

Mechanism:

- HMAC-SHA256(master_key, user_id)
- base64-url encode the digest
- use the result as the Fernet key

Used for:

- encrypted raw archive content
- encrypted OAuth tokens
- encrypted values stored in `pii_vault`

### 5.5 Tag Extraction

`backend/app/pipeline/tagger.py` maps keywords to tags such as:

- `hiring`
- `investor`
- `gtm`
- `technical`
- `fundraise`
- `burn`
- `customer`

These tags drive retrieval context and threshold checks.

### 5.6 Action Item Detection

`backend/app/pipeline/action_items.py` applies regex and keyword heuristics to flag text that likely contains a promise, blocker, ETA, follow-up, or unresolved work.

The resulting `is_action_item` flag is stored in Pinecone metadata and later used to boost retrieval for meeting prep.

### 5.7 Vector Storage

`backend/app/pipeline/embedder.py`:

- embeds text locally with `SentenceTransformer("all-MiniLM-L6-v2")`
- upserts vectors into Pinecone

Namespaces:

- `founder_memory`
  - redacted founder communications
  - archived guide dilemmas
- `startup_playbooks`
  - external benchmark/playbook content used by the Guide

Stored `founder_memory` metadata includes:

- `user_id`
- `source`
- `text`
- `entities`
- `context_tags`
- `topic`
- `source_id`
- `source_url`
- `is_action_item`
- `ingested_at`

## 6. Assistant Prep Flow

Assistant prep generation lives in `backend/app/assistant/meeting_prep.py`.

### 6.1 Trigger Sources

Prep cards can be triggered by:

- manual meeting creation through `/api/meetings`
- Google Calendar sync through `/api/auth/google/sync`
- scheduled calendar polling
- demo/simulator prep triggers
- email-based meeting detection in `real_ingestion.py`

### 6.2 Retrieval Strategy

The prep generator runs three Pinecone queries against `founder_memory`:

- entity-filtered query
- topic-only query
- action-item-only query

Then it:

- boosts action-item matches
- deduplicates by vector id
- keeps the best snippets
- builds an LLM prompt from the redacted snippet text

### 6.3 Output Shape

The result is a JSON-like prep card with:

- `type: "ASSISTANT_PREP"`
- `topic`
- `summary`
- `promises`
- `unresolved_loops`
- `jump_to_thread_url`
- `entities`
- `generated_at`

The worker:

- saves this card into `summaries`
- publishes it to `founder:{user_id}` via Redis

## 7. Guide Flow

Guide orchestration is defined in `backend/app/guide/graph.py` and `backend/app/guide/nodes.py`.

### 7.1 Trigger Sources

Guide cards can be triggered by:

- `/api/guide`
- daily threshold evaluation when milestone conditions are met
- demo milestone generation

### 7.2 LangGraph State

The graph carries:

- `user_id`
- `question`
- `founder_profile`
- `communication_style`
- `kb_results`
- `analysis`
- `red_flags`
- `output`

### 7.3 Node Sequence

1. `fetch_founder_state`
   - loads `startup_profiles` from Postgres
2. `evaluate_company_stage`
   - derives communication style from stage
3. `query_knowledge_base`
   - queries Pinecone in two spaces:
     - `founder_memory`
     - `startup_playbooks`
4. `cross_reference_and_analyze`
   - sends founder profile and retrieved context to Groq
5. `check_red_flags`
   - applies deterministic heuristics
6. `generate_decision_framework`
   - asks Groq for the final structured output

### 7.4 Persistence and Feedback Loop

After a guide run, the worker:

- saves the card into `summaries`
- archives a "Past Dilemma" vector back into `founder_memory`
- publishes the card to Redis for real-time delivery

This means past guide outputs become retrievable context for future guide runs.

## 8. Ingestion Adapters

### 8.1 Gmail

`backend/app/ingestion/gmail.py`

Responsibilities:

- authenticate with Google credentials JSON
- list recent messages
- fetch full message bodies
- construct `DATA_INGESTION` events
- tag messages
- flag action items
- include Gmail thread URLs
- enqueue worker tasks

Query behavior:

- if `after` is provided, uses `after:<timestamp>`
- otherwise defaults to `newer_than:7d`

### 8.2 Slack

`backend/app/ingestion/slack.py`

Responsibilities:

- list visible channels
- poll channel history
- optionally handle webhook-style payloads
- create Slack permalinks
- build `DATA_INGESTION` events and enqueue them

### 8.3 Calendar

`backend/app/ingestion/calendar.py`

Responsibilities:

- read upcoming Google Calendar events
- persist each meeting as a `MEETING` summary
- enqueue `ASSISTANT_PREP` tasks for newly seen meetings
- update existing meeting summary rows when calendar details change

Deduplication is done via:

- `source_ref = "google-calendar:{event_id}"`

## 9. Scheduled and Proactive Jobs

### 9.1 Real Pollers

`backend/app/workers/real_ingestion.py`

Provides:

- `poll_gmail_real`
- `poll_slack_real`

These tasks iterate all connected users and invoke the real adapters with the user's decrypted tokens.

### 9.2 Email-Based Meeting Detection

After Gmail polling, `_detect_and_save_meetings(...)` additionally scans ingested email events for meeting signals.

Detection logic:

- keyword search for terms like `meeting`, `call`, `schedule`, `zoom`, `google meet`
- direct meeting-link extraction

If detected:

- save a `MEETING` summary if one does not already exist
- enqueue `ASSISTANT_PREP`

### 9.3 Threshold Evaluator

`backend/app/workers/thresholds.py`

Daily job:

- computes support-load percentage from `archive.context_tags` over the last 7 days
- checks startup profile metrics
- if support load is above 20% and MRR is above $10k
- and a milestone was not already triggered within 24 hours
- enqueue a proactive `GUIDE_QUERY` milestone card

Current milestone implemented:

- `Milestone Trigger: First Success Hire`

## 10. Demo Mode

Demo behavior is implemented in `backend/app/demo/persona.py` and exposed through `/api/demo/*`.

When demo mode is enabled:

- a deterministic demo user can be auto-created
- a deterministic startup profile can be seeded
- archive, summaries, and PII vault rows for the demo user can be reset
- vectors for the demo user can be purged from Pinecone
- realistic Gmail, Slack, prep, and growth events can be enqueued through the normal worker pipeline

Important detail:

- demo data is not a side channel
- it intentionally flows through the same Celery and storage paths as real data

## 11. Endpoint Reference

This section documents every backend HTTP and WebSocket entrypoint currently registered in FastAPI.

### 11.1 Infrastructure Endpoints

#### `GET /health`

Purpose:

- lightweight liveness check

Auth:

- none

Response:

```json
{"status":"ok"}
```

#### `GET /ws/{user_id}` WebSocket

Purpose:

- opens a persistent WebSocket for real-time card delivery

How it works:

- accepts the socket
- stores it under `{user_id}`
- waits for client messages only to keep the connection open
- sends pushed JSON messages when Redis pub/sub receives events for `founder:{user_id}`

Auth:

- none at the WebSocket layer

Typical payloads delivered:

- assistant prep cards
- guide query cards
- demo reset notifications

### 11.2 Auth Endpoints

Prefix: `/api/auth`

#### `POST /api/auth/signup`

Purpose:

- create a local password account
- if a matching valid account already exists and the password matches, it behaves like sign-in
- if a legacy/malformed password hash exists, it allows password re-initialization

Body:

```json
{
  "email": "user@example.com",
  "password": "min-8-chars",
  "full_name": "Optional Name"
}
```

Returns:

- signed session token
- public user object

Side effects:

- creates or updates `users`
- stores `password_hash`

#### `POST /api/auth/signin`

Purpose:

- authenticate a local password account

Body:

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

Returns:

- signed session token
- public user object

Errors:

- `401` invalid credentials
- `400` if the account is in a legacy malformed-hash state

#### `POST /api/auth/demo-session`

Purpose:

- issue a session token for the demo user when demo mode is enabled

Behavior:

- ensures demo persona exists
- if the demo user has no summaries yet, queues demo history and guide/prep generation

Auth:

- none

Returns:

- demo token
- demo user object

#### `GET /api/auth/me`

Purpose:

- fetch the current authenticated user's public profile

Auth:

- required

Returns:

- `{ "user": ... }`

#### `GET /api/auth/integrations`

Purpose:

- return Google and Slack connection status for the current user

Auth:

- required

Returns:

- Google connected state and last sync timestamp
- Slack connected state, team id, selected channel ids, and last sync timestamp

#### `POST /api/auth/google/start`

Purpose:

- begin Google OAuth flow

Auth:

- required

Body:

```json
{"return_to":"/ingest"}
```

Behavior:

- creates Google OAuth flow with configured scopes
- stores flow object in in-memory `_flow_store`
- returns the Google authorization URL

Important limitation:

- state is stored only in process memory
- restarting the FastAPI process invalidates pending auth flows

#### `GET /api/auth/google/callback`

Purpose:

- finish Google OAuth flow

Query params:

- `code`
- `state`

Behavior:

- loads the saved flow from `_flow_store`
- exchanges code for tokens
- loads user info from Google's OpenID endpoint
- rejects the connection if the Google email does not match the signed-in app user
- encrypts and stores the credentials JSON in `users.google_token`
- redirects back to the frontend with status query params

Returns:

- `302` redirect to frontend

#### `DELETE /api/auth/google/disconnect`

Purpose:

- disconnect Google from the current user

Auth:

- required

Side effects:

- clears `google_token`
- clears `google_last_synced_at`

#### `POST /api/auth/google/sync`

Purpose:

- perform an immediate Google sync for the current user

Auth:

- required

Behavior:

- decrypt stored Google credentials
- poll Gmail for up to 10 recent messages after the last sync time
- sync upcoming calendar events for the next 14 days
- update `google_last_synced_at`

Returns:

- status
- number of Gmail events queued
- number of calendar meetings created
- number of prep cards queued

Side effects:

- enqueues `DATA_INGESTION`
- may create `MEETING` summaries
- may enqueue `ASSISTANT_PREP`

#### `POST /api/auth/slack/start`

Purpose:

- begin Slack OAuth flow

Auth:

- required

Body:

```json
{"return_to":"/ingest"}
```

Behavior:

- validates Slack client config
- generates random state
- stores state in in-memory `_slack_state_store`
- returns Slack authorization URL

#### `GET /api/auth/slack/callback`

Purpose:

- finish Slack OAuth flow

Query params:

- `code`
- `state`

Behavior:

- exchanges code for Slack access token
- encrypts and stores token in `users.slack_token`
- stores team id in `users.slack_team_id`
- redirects to the frontend with success/error query params

Returns:

- `302` redirect

#### `GET /api/auth/slack/channels`

Purpose:

- list selectable Slack channels for the current user

Auth:

- required

Behavior:

- decrypts Slack token
- calls `conversations_list`

Returns:

- array of `{id, name, is_private}`

#### `DELETE /api/auth/slack/disconnect`

Purpose:

- disconnect Slack from the current user

Auth:

- required

Side effects:

- clears token, team id, selected channel ids, and last sync timestamp

#### `POST /api/auth/slack/sync`

Purpose:

- perform an immediate Slack sync

Auth:

- required

Body:

```json
{
  "channel_ids": ["C123", "C456"]
}
```

Behavior:

- if body channel ids are provided, uses them
- else reuses saved channel ids
- else auto-selects up to 20 visible channels
- polls recent Slack history since `slack_last_synced_at`
- updates `slack_channel_ids`
- updates `slack_last_synced_at`

Returns:

- sync status
- channels used
- number of messages queued

Side effects:

- enqueues `DATA_INGESTION` events per message

#### `DELETE /api/auth/disconnect`

Purpose:

- disconnect all integrations from the current user

Auth:

- required

Side effects:

- clears Google and Slack tokens and associated sync metadata

### 11.3 Summary and Archive Endpoints

#### `GET /api/summaries`

Purpose:

- fetch recent summary rows for a user

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Query params:

- `user_id` optional
- `limit` default 20, max 100
- `offset` default 0

Behavior:

- loads summary rows newest first
- tries to parse JSON stored in `summary_text`
- if parsing succeeds, returns parsed data in `payload`

Response:

- `{ "summaries": [...], "total": <count of returned rows> }`

#### `GET /api/archive`

Purpose:

- fetch archive metadata without decrypting content

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Query params:

- `user_id` optional
- `limit` default 20, max 100
- `offset` default 0

Returns per item:

- id
- user_id
- source
- context tags
- PII tokens
- ingestion timestamp

#### `GET /api/archive/{item_id}`

Purpose:

- fetch one archived item with redacted content and encrypted PII token mapping

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Behavior:

- verifies ownership
- returns `content_redacted`
- loads matching `pii_vault` rows for the archive's tokens
- returns `pii_mapping_enc`

Important note:

- the endpoint does not decrypt PII values
- it returns encrypted token mappings

#### `DELETE /api/archive/{item_id}`

Purpose:

- delete an archived item

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Behavior:

- best-effort deletes the vector from Pinecone namespace `founder_memory`
- deletes the Postgres archive row

Returns:

- deletion status and id

### 11.4 Manual Ingestion Endpoints

Prefix: `/api/ingest`

These are lightweight wrappers around event creation. They do not process content inline.

#### `POST /api/ingest/email`

Purpose:

- manually submit an email-shaped payload for ingestion

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Body:

```json
{
  "user_id": "optional-uuid",
  "from_address": "sender@example.com",
  "subject": "Subject",
  "body": "Email body"
}
```

Behavior:

- constructs a `DATA_INGESTION` event with `source=GMAIL`
- marks context as `["email", "manual-ingest"]`
- infers `is_action_item`
- enqueues `process_founder_event`

Returns:

- `status=queued`
- `trace_id`

#### `POST /api/ingest/slack`

Purpose:

- manually submit a Slack-shaped payload for ingestion

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Body:

```json
{
  "user_id": "optional-uuid",
  "channel": "#support",
  "message": "Slack message text"
}
```

Behavior:

- normalizes the channel to `#...`
- constructs a `DATA_INGESTION` event with `source=SLACK`
- marks context as `["slack", "manual-ingest"]`
- infers `is_action_item`
- enqueues `process_founder_event`

Returns:

- `status=queued`
- `trace_id`

### 11.5 Meeting Endpoints

Prefix: `/api/meetings`

#### `POST /api/meetings`

Purpose:

- create a meeting record manually and trigger prep generation

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Body:

```json
{
  "user_id": "optional-uuid",
  "topic": "Investor update",
  "attendees": ["a@example.com", "b@example.com"],
  "scheduled_at": "optional ISO timestamp"
}
```

Behavior:

- creates a `MEETING` row in `summaries`
- stores attendees and scheduled time inside `summary_text`
- enqueues an `ASSISTANT_PREP` event with `source=CALENDAR`

Returns:

- `status=scheduled`
- created meeting id

#### `GET /api/meetings`

Purpose:

- list meeting summaries for a user

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Query params:

- `user_id` optional
- `limit` default 20

Behavior:

- loads `summaries` rows with `type="MEETING"`
- parses attendees and scheduled time back out of `summary_text`
- returns normalized meeting objects

### 11.6 Guide Endpoint

#### `POST /api/guide`

Purpose:

- submit a founder question for asynchronous strategic analysis

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Body:

```json
{
  "question": "Should I hire a CTO this quarter?",
  "user_id": "optional-uuid"
}
```

Behavior:

- builds a `GUIDE_QUERY` event
- enqueues `process_founder_event` at priority 2
- returns queue identifiers immediately

Returns:

- `task_id`
- `trace_id`

Downstream:

- worker runs LangGraph
- summary is saved
- result is pushed to WebSocket listeners

### 11.7 Chat Endpoint

#### `POST /api/chat`

Purpose:

- synchronous founder Q&A over stored founder context

Auth:

- bearer token preferred
- otherwise accepts `user_id`

Body:

```json
{
  "user_id": "optional-uuid",
  "message": "What did Marcus ask for last week?",
  "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}]
}
```

Behavior:

- resolves user
- retrieves context from Pinecone semantic search first
- falls back to the latest 20 redacted archive rows from Postgres
- builds a Groq chat prompt
- preserves privacy placeholders exactly
- returns a direct response inline

Returns:

- `{ "reply": "..." }`

Important distinction:

- unlike `/api/guide`, this endpoint is synchronous and does not go through Celery

### 11.8 Simulator Endpoint

#### `POST /api/simulate`

Purpose:

- manually fire simulator ingestion/prep events

Auth:

- none

Body:

```json
{
  "user_id": "optional uuid, defaults to demo user",
  "source": "gmail|slack|calendar|all"
}
```

Behavior:

- validates the UUID or falls back to the demo user
- for Gmail and Slack, calls simulator `poll(...)` directly
- for Calendar, enqueues `poll_calendar_simulated`

Returns:

- queued status
- resolved user id
- list of fired sources

### 11.9 Demo Endpoints

Prefix: `/api/demo`

All endpoints except `/status` require `DEMO_MODE=true`.

#### `GET /api/demo/status`

Purpose:

- expose whether demo mode is enabled and which demo user id is configured

#### `GET /api/demo/snapshot`

Purpose:

- return current demo-user profile and data counts

Behavior:

- ensures demo persona exists
- returns:
  - profile
  - archive count
  - summary count
  - latest summary timestamp

#### `POST /api/demo/bootstrap`

Purpose:

- reset and/or repopulate demo data through the normal worker pipeline

Body:

```json
{"reset":false}
```

Behavior:

- ensures or resets demo persona
- queues full Gmail, Slack, prep, and growth events

#### `POST /api/demo/trigger-email`

Purpose:

- queue one or many demo Gmail events

Body:

```json
{"mode":"single"}
```

`mode`:

- `single`
- `full`

#### `POST /api/demo/trigger-slack`

Purpose:

- queue one or many demo Slack events

Body:

```json
{"mode":"single"}
```

#### `POST /api/demo/trigger-prep`

Purpose:

- queue a demo assistant-prep event

#### `POST /api/demo/trigger-growth`

Purpose:

- queue a proactive guide milestone event

#### `POST /api/demo/reset`

Purpose:

- hard reset demo user data and notify live clients

Behavior:

- resets demo rows and vectors
- queues full demo history
- publishes a `DEMO_RESET` event to Redis channel `founder:{DEMO_USER_ID}`

Returns:

- reset status
- queue summary

## 12. End-to-End Backend Flows

### 12.1 Real Email Sync

1. Client calls `POST /api/auth/google/sync`.
2. Backend decrypts the stored Google credentials.
3. `GmailWorker.poll(...)` fetches recent Gmail messages.
4. Each message becomes a `DATA_INGESTION` Celery event.
5. Worker redacts PII, encrypts raw text, stores vector memory, stores archive row, and optionally creates a meeting row.

### 12.2 Meeting Prep Generation

1. A meeting is created by calendar sync, manual meeting creation, simulator, or demo events.
2. An `ASSISTANT_PREP` task is enqueued.
3. Worker retrieves relevant founder memory from Pinecone.
4. Groq synthesizes a prep card.
5. Card is saved into `summaries`.
6. Card is published to Redis.
7. FastAPI forwards it over WebSocket to the frontend.

### 12.3 Strategic Guide Query

1. Client posts to `/api/guide`.
2. Backend enqueues `GUIDE_QUERY`.
3. Worker runs the LangGraph pipeline.
4. Result is saved into `summaries`.
5. A "past dilemma" vector is inserted into `founder_memory`.
6. Result is published to Redis and streamed to the client.

### 12.4 Privacy Inspection

1. Client requests `/api/archive`.
2. Backend returns archive metadata only.
3. Client requests `/api/archive/{item_id}`.
4. Backend returns redacted content plus encrypted PII mapping for the associated tokens.

## 13. Current Implementation Notes

These points are important when reading or extending the backend:

- The FastAPI app uses async SQLAlchemy sessions, but many worker/helper functions use separate synchronous SQLAlchemy engines.
- OAuth in-progress state is stored in process memory, so it is not durable across backend restarts.
- Summary rows are polymorphic and may contain either text or serialized JSON in `summary_text`.
- The archive delete endpoint deletes Postgres rows and attempts Pinecone cleanup, but does not clean `pii_vault` rows tied to the deleted archive item.
- The WebSocket endpoint does not authenticate clients by token; routing is based only on the `user_id` in the path.
- Several older documentation files describe earlier model/provider choices; this file reflects the current backend codepath.

## 14. Relevant Source Files

- `backend/app/main.py`
- `backend/app/security.py`
- `backend/app/api/routes/*.py`
- `backend/app/api/ws.py`
- `backend/app/models/*.py`
- `backend/app/schemas/events.py`
- `backend/app/ingestion/*.py`
- `backend/app/pipeline/*.py`
- `backend/app/assistant/meeting_prep.py`
- `backend/app/guide/*.py`
- `backend/app/demo/persona.py`
- `backend/app/workers/*.py`
