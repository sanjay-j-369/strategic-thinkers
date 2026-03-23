# 06 — Simulator: Dual-Mode Ingestion

The system ships with **two parallel ingestion paths** controlled by a single environment variable. Default is `simulate` so the full pipeline runs on day one without any OAuth2 credentials.

---

## The Feature Flag

```bash
# .env
INGESTION_MODE=simulate   # "real" | "simulate"  (default: simulate)
SIMULATOR_SPEED=normal    # "fast" | "normal" | "slow"
```

| Mode | Ingestion Source | Credentials Required |
|------|-----------------|---------------------|
| `simulate` | Tweakable stub data from `fixtures.py` | None |
| `real` | Live Gmail / Slack / Google Calendar via OAuth2 | Google + Slack API keys |

---

## The Mode Router

**File:** `backend/app/ingestion/mode_router.py`

```python
import os

INGESTION_MODE = os.getenv("INGESTION_MODE", "simulate")

def get_gmail_worker():
    if INGESTION_MODE == "real":
        from .gmail import GmailWorker
        return GmailWorker()
    from .simulator.gmail_sim import GmailSimulator
    return GmailSimulator()

def get_slack_worker():
    if INGESTION_MODE == "real":
        from .slack import SlackWorker
        return SlackWorker()
    from .simulator.slack_sim import SlackSimulator
    return SlackSimulator()

def get_calendar_worker():
    if INGESTION_MODE == "real":
        from .calendar import poll_calendar_events
        return poll_calendar_events
    from .simulator.calendar_sim import poll_calendar_simulated
    return poll_calendar_simulated
```

---

## Simulator File Layout

```
backend/app/ingestion/
├── gmail.py             # Real OAuth2 Gmail poller
├── slack.py             # Real Slack webhook handler
├── calendar.py          # Real Google Calendar poller
├── mode_router.py       # Feature flag switch
└── simulator/
    ├── __init__.py
    ├── config.py        # All tweakable knobs ← edit this
    ├── fixtures.py      # Fake emails, Slack messages, meetings
    ├── gmail_sim.py     # Emits fake DATA_INGESTION events
    ├── slack_sim.py     # Emits fake DATA_INGESTION events
    └── calendar_sim.py  # Emits fake ASSISTANT_PREP events
```

---

## Tweakable Config

**File:** `backend/app/ingestion/simulator/config.py`

This is the **single place** to configure a simulation scenario.

```python
from dataclasses import dataclass, field
from typing import Literal

@dataclass
class SimulatorConfig:

    # ── Founder Persona ──────────────────────────────────────────────────
    founder_email:   str   = "alex@myStartup.io"
    founder_name:    str   = "Alex Chen"
    startup_stage:   Literal["pre-seed", "seed", "series-a"] = "seed"
    mrr_usd:         float = 18_000
    burn_rate_usd:   float = 45_000
    headcount:       int   = 7
    has_cto:         bool  = False

    # ── External Contacts ────────────────────────────────────────────────
    contacts: list[dict] = field(default_factory=lambda: [
        {"name": "Sarah Kim",  "email": "sarah@vc-firm.com",   "role": "investor"},
        {"name": "Marcus Lee", "email": "marcus@client-co.com", "role": "customer"},
        {"name": "Dev Team",   "email": "dev@myStartup.io",     "role": "internal"},
    ])

    # ── Event Emission Rate ──────────────────────────────────────────────
    email_interval_sec:  int = 60   # emit a fake email every N seconds
    slack_interval_sec:  int = 30   # emit a fake Slack msg every N seconds
    meeting_in_minutes:  int = 28   # meeting fires this many mins from now

    # ── Scenario Presets ─────────────────────────────────────────────────
    trigger_cto_hiring_question: bool = True
    trigger_fundraise_question:  bool = False

SIM_CONFIG = SimulatorConfig()   # ← edit this instance to change scenario
```

### Common Scenario Presets

| Scenario | Config Change |
|----------|--------------|
| Burn crisis | `burn_rate_usd=80_000`, `mrr_usd=8_000`, `runway_months=4` |
| Series A ready | `stage="series-a"`, `mrr_usd=120_000`, `has_cto=True` |
| Fast demo (instant events) | `email_interval_sec=5`, `meeting_in_minutes=1` |
| Investor update prep | `trigger_fundraise_question=True` |

---

## Fixture Data

**File:** `backend/app/ingestion/simulator/fixtures.py`

```python
FAKE_EMAILS = [
    {
        "subject": "Re: Q2 Roadmap Review",
        "from":    "marcus@client-co.com",
        "body":    "Hi Alex, following up on the API rate limits we discussed. "
                   "We still see 429s in production. Can we get a fix by Friday?",
        "tags":    ["customer", "gtm", "technical"],
    },
    {
        "subject": "Your runway",
        "from":    "sarah@vc-firm.com",
        "body":    "Hey Alex—quick check-in. Burn looks high vs. MRR. "
                   "What's the plan to hit ramen profitability?",
        "tags":    ["investor", "fundraise", "burn"],
    },
    {
        "subject": "Contractor invoices — June",
        "from":    "dev@myStartup.io",
        "body":    "Alex, 4 contractor invoices attached totalling $18k this month.",
        "tags":    ["hiring", "dev-spend"],
    },
]

FAKE_SLACK_MESSAGES = [
    {"channel": "#engineering", "text": "Deploy failed on main — hotfix needed ASAP",        "tags": ["technical"]},
    {"channel": "#growth",      "text": "Marcus from Client Co wants a demo next week",       "tags": ["gtm", "customer"]},
    {"channel": "#founders",    "text": "Should we post the Series A deck to DocSend today?", "tags": ["fundraise"]},
]

FAKE_MEETINGS = [
    {"summary": "Q2 Roadmap Review",            "attendees": ["marcus@client-co.com"]},
    {"summary": "Investor Update Call — Sarah", "attendees": ["sarah@vc-firm.com"]},
]
```

---

## Simulator Workers

### GmailSimulator

Picks a random email from `FAKE_EMAILS` and enqueues a `DATA_INGESTION` event (priority 2).

### SlackSimulator

Picks a random Slack message from `FAKE_SLACK_MESSAGES` and enqueues a `DATA_INGESTION` event (priority 2).

### CalendarSimulator (Celery Beat)

Enqueues an `ASSISTANT_PREP` event (priority 1) simulating a meeting `SIM_CONFIG.meeting_in_minutes` from now. This triggers the full meeting prep card flow.

---

## Beat Schedule — Mode-Aware

```python
# backend/app/workers/beat_schedule.py
import os
from celery.schedules import crontab

_mode = os.getenv("INGESTION_MODE", "simulate")

CELERYBEAT_SCHEDULE = {
    "poll-calendar": {
        "task":     "poll_calendar_events" if _mode == "real" else "poll_calendar_simulated",
        "schedule": crontab(minute="*/15"),
    },
}
```

---

## Switching Modes

```bash
# Simulate (default — no credentials needed)
docker compose up

# Switch to live Google/Slack data
INGESTION_MODE=real docker compose up
```

The simulator emits events using the **exact same `FounderEvent` schema** as the real workers, so the entire pipeline (PII strip → embed → WebSocket → UI) is exercised identically in both modes.
