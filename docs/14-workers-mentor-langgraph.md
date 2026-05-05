# Workers and Mentor LangGraph Runtime

This document explains how the hired workers and mentor run, what graph path each one follows, what triggers them, and how chat differs from background work.

## Short Answer

Yes: hired workers and mentor background runs use LangGraph.

There are two important exceptions/clarifications:

- Worker chat is not the worker graph. It is an interactive RAG chat endpoint scoped by worker tags and system prompt.
- GTM uses the shared worker LangGraph path first, then gets GTM-specific report post-processing after the graph completes.

## Runtime Layers

The production path is:

1. Scheduler or API enqueues a task in Postgres.
2. `PostgresTaskRunner` leases the task.
3. The task handler starts an `AgentRun`.
4. The agent service invokes a LangGraph graph.
5. Outputs are saved as notifications, drafts, promises, or run snapshots.
6. The frontend polls or receives updates and shows progress/output.

Primary files:

- `backend/app/runtime/scheduler.py`
- `backend/app/runtime/queue.py`
- `backend/app/runtime/task_handlers.py`
- `backend/app/agentic/workers/service.py`
- `backend/app/agentic/workers/graph.py`
- `backend/app/agentic/workers/nodes.py`
- `backend/app/agentic/mentor/service.py`
- `backend/app/agentic/mentor/graph.py`
- `backend/app/agentic/mentor/nodes.py`

## Worker Catalog

Workers are defined in `backend/app/services/worker_directory.py`.

The current worker catalog:

- GTM Agent
- Hiring Agent
- Finance Agent
- Product Agent
- Compliance Agent

Each catalog item defines:

- `worker_key`
- display name
- lane
- retrieval tags
- default config

Only hired workers run in background sweeps. Available or paused workers do not run.

## Worker Triggers

Workers can run in two ways:

- Scheduled sweep: registered in `backend/app/runtime/scheduler.py` as `TaskNames.AI_WORKER_SWEEP`.
- Manual run: `POST /api/workers/{worker_key}/run`, added for demos and debugging.

Both paths enqueue the same task name and reach the same handler:

```text
AI_WORKER_SWEEP
  -> ai_worker_handler
  -> run_worker_agent
  -> WorkerLaneAgent.run
  -> build_worker_graph().invoke(state)
```

## Shared Worker Graph

All catalog workers use the same LangGraph structure.

Graph file: `backend/app/agentic/workers/graph.py`

```text
load_lane_context
  -> identify_blockers
  -> compose_operator_alert
  -> END
```

### Node 1: `load_lane_context`

File: `backend/app/agentic/workers/nodes.py`

Purpose:

- Loads memory from the founder archive/vector store by worker tags.
- Uses worker config such as monitor targets and custom instructions.
- Adds startup profile context when available.
- Applies lane-specific filtering.

For GTM, this node filters out hiring/recruiting/candidate context and keeps only GTM/customer/revenue/pipeline/billing style context.

### Node 2: `identify_blockers`

Purpose:

- Reads the loaded snippets.
- Finds relevant blockers/signals for the lane.
- Uses the LLM through `complete_text` to summarize surfaced issues.

For GTM, the prompt is explicitly scoped to:

- sales pipeline
- revenue
- customer escalations
- renewals
- expansion
- churn risk
- revenue blockers
- customer commitments

It excludes hiring, recruiting, candidate evaluation, and generic internal operations unless tied directly to customer or revenue impact.

### Node 3: `compose_operator_alert`

Purpose:

- Converts the worker summary into founder-facing output.
- Creates a notification payload.
- Creates a draft payload when there is something actionable.
- Keeps delivery in vault mode. The worker prepares work; the founder approves/sends.

For GTM, the notification type is:

```text
GTM_REPORT_READY
```

The founder sees that the GTM report is ready and can review, chat, or adjust the worker focus.

## GTM Worker Specific Behavior

The GTM Agent follows the shared worker graph, then receives GTM-specific post-processing.

Path:

```text
run_worker_agent
  -> shared worker LangGraph
  -> execute_gtm_agent
  -> save notification/draft/run
```

File: `backend/app/services/gtm_agent.py`

The post-processor formats the output as a founder-reviewed GTM report. It does not send email automatically.

Expected GTM report sections:

- Revenue/Customer Signals
- Risks
- Recommended Founder Actions
- Owners/Dates

## Hiring, Finance, Product, Compliance Workers

These workers use the same graph:

```text
load_lane_context
  -> identify_blockers
  -> compose_operator_alert
  -> END
```

The difference is their catalog metadata:

- different `lane`
- different retrieval `tags`
- different `monitor_targets`
- different `custom_instructions`

They do not use `execute_gtm_agent`. That post-processing is GTM-only.

## Mentor Graph

The mentor is a separate LangGraph agent.

Graph file: `backend/app/agentic/mentor/graph.py`

```text
load_profile_and_history
  -> derive_operating_signals
  -> generate_findings
  -> compose_mentor_notifications
  -> END
```

### Node 1: `load_profile_and_history`

Loads:

- startup profile
- previous mentor snapshot

The startup profile includes values such as:

- stage
- MRR
- burn rate
- runway
- headcount
- CTO status
- development spend percentage

### Node 2: `derive_operating_signals`

Reads recent archive memory and calculates operating signals:

- support load percentage
- recent message count
- late-night Slack ratio
- terse Slack reply ratio

These are heuristics for strategic pressure, support load, and possible founder burnout risk.

### Node 3: `generate_findings`

Turns profile + signals into mentor findings.

Current finding types include:

- `HIRING_TRIGGER`
- `RUNWAY_ALERT`
- `BURNOUT_ALERT`

It also asks the LLM to produce a board-style weekly memo from those findings.

### Node 4: `compose_mentor_notifications`

Packages findings into founder-facing mentor notifications.

If there are no major findings, it emits a lower-severity mentor check-in.

## Mentor Triggers

Mentor runs from:

- scheduled weekly review
- threshold scan paths
- guide/growth demo triggers depending on scenario

Main scheduled task:

```text
MENTOR_WEEKLY_REVIEW
  -> mentor_handler
  -> run_mentor_review
  -> MentorAgent.run
  -> build_mentor_graph().invoke(state)
```

## Assistant Graph

The Chief of Staff Assistant is also LangGraph-based, but it is distinct from workers and mentor.

Graph file: `backend/app/agentic/assistant/graph.py`

```text
load_recent_communications
  -> extract_commitments
  -> detect_draft_candidates
  -> detect_vip_interruptions
  -> detect_context_routing
  -> compose_assistant_outputs
  -> END
```

It handles:

- promise extraction
- draft replies
- VIP/investor interruptions
- morning briefings
- context routing

## Chat vs Background Worker Runs

This is the most important product distinction.

### Background/manual worker run

Uses LangGraph.

```text
Run button or scheduler
  -> task queue
  -> AgentRun
  -> worker LangGraph
  -> notifications/drafts/report
```

This is the source of:

- worker progress entries
- report-ready notifications
- draft payloads
- persisted run history

### Worker chat

Does not run the worker graph.

```text
Worker chat UI
  -> /api/chat
  -> fetch redacted worker-scoped memory by tags
  -> LLM response
  -> frontend resolves PII tokens when possible
```

Chat is for:

- asking follow-up questions
- tweaking a report
- asking the worker to focus on a segment/account/topic
- asking for a downloadable report from current memory

Chat does not by itself create an `AgentRun` or execute the worker graph. If you want persisted worker output and progress, use the Run button or wait for the scheduled sweep.

## Privacy Behavior

The runtime uses redacted memory for LLM calls.

PII handling:

- Raw source content is encrypted.
- Redacted content goes into memory/search.
- PII token-value mappings are stored in the PII vault.
- Frontend resolves tokens only when key material is available.

During worker chat:

- User-typed PII is tokenized before sending.
- Backend memory tokens can be resolved in the frontend through the vault resolver.
- If private key material is not unlocked, tokens remain visible.

## Progress Visibility

The UI progress panel reads recent agent runs from:

```text
GET /api/ops/runs?pillar=WORKER
GET /api/ops/runs?pillar=MENTOR
```

It shows safe execution status and output previews:

- queued/running/succeeded/failed
- trigger type
- latest notification body
- blocker/report summary
- errors

It intentionally does not expose hidden model chain-of-thought.

## Demo Flow

Recommended demo sequence:

1. Sign in and unlock the encrypted workspace.
2. Hire the GTM Agent.
3. Trigger `scenario_startup_context`.
4. Trigger `scenario_server_outage` or another GTM/customer scenario.
5. Open Workers -> Active Workers.
6. Click Run on GTM Agent.
7. Watch Worker and Mentor Progress.
8. Open the notification/report.
9. Chat with GTM to tweak the report or ask it to focus on a segment/account.

