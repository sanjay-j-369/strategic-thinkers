from dataclasses import dataclass, field
from typing import Literal


@dataclass
class SimulatorConfig:

    # ── Founder Persona ──────────────────────────────────────────────────
    founder_email: str = "alex@myStartup.io"
    founder_name: str = "Alex Chen"
    startup_stage: Literal["pre-seed", "seed", "series-a"] = "seed"
    mrr_usd: float = 18_000
    burn_rate_usd: float = 45_000
    headcount: int = 7
    has_cto: bool = False

    # ── External Contacts ────────────────────────────────────────────────
    contacts: list[dict] = field(default_factory=lambda: [
        {"name": "Sarah Kim",  "email": "sarah@vc-firm.com",    "role": "investor"},
        {"name": "Marcus Lee", "email": "marcus@client-co.com", "role": "customer"},
        {"name": "Dev Team",   "email": "dev@myStartup.io",     "role": "internal"},
    ])

    # ── Event Emission Rate ──────────────────────────────────────────────
    email_interval_sec: int = 60   # emit a fake email every N seconds
    slack_interval_sec: int = 30   # emit a fake Slack msg every N seconds
    meeting_in_minutes: int = 28   # meeting fires this many mins from now

    # ── Scenario Presets ─────────────────────────────────────────────────
    trigger_cto_hiring_question: bool = True
    trigger_fundraise_question: bool = False


SIM_CONFIG = SimulatorConfig()   # ← edit this instance to change scenario
