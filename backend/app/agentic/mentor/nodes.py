from __future__ import annotations

from datetime import datetime
from typing import TypedDict

from app.agentic.context import load_last_agent_snapshot, load_startup_profile, recent_archive_items
from .formatting import build_board_memo


class MentorState(TypedDict):
    user_id: str
    profile: dict
    prior_snapshot: dict
    signals: dict
    findings: list[dict]
    notifications: list[dict]
    memo: str


def load_profile_and_history(state: MentorState) -> MentorState:
    profile = load_startup_profile(state["user_id"])
    prior_snapshot = load_last_agent_snapshot(state["user_id"], "MENTOR", "Board Member")
    return {**state, "profile": profile, "prior_snapshot": prior_snapshot}


def derive_operating_signals(state: MentorState) -> MentorState:
    recent = recent_archive_items(state["user_id"], since_hours=24 * 7, limit=120)
    support_count = 0
    slack_count = 0
    late_night_count = 0
    terse_count = 0
    for item in recent:
        tags = item.get("context_tags") or []
        text = item.get("text", "")
        if "support" in tags or "customer" in tags:
            support_count += 1
        if item.get("source") == "SLACK":
            slack_count += 1
            try:
                hour = datetime.fromisoformat(item["ingested_at"].replace("Z", "+00:00")).hour
                if hour >= 22 or hour <= 5:
                    late_night_count += 1
            except Exception:
                pass
            if len(text.strip()) <= 40:
                terse_count += 1

    support_load_pct = round((support_count / len(recent)) * 100.0, 2) if recent else 0.0
    late_night_ratio = round((late_night_count / slack_count), 2) if slack_count else 0.0
    terse_ratio = round((terse_count / slack_count), 2) if slack_count else 0.0
    return {
        **state,
        "signals": {
            "support_load_pct": support_load_pct,
            "late_night_ratio": late_night_ratio,
            "terse_ratio": terse_ratio,
            "recent_message_count": len(recent),
        },
    }


def generate_findings(state: MentorState) -> MentorState:
    profile = state.get("profile", {}) or {}
    prior = state.get("prior_snapshot", {}) or {}
    signals = state.get("signals", {}) or {}
    findings: list[dict] = []

    if float(profile.get("mrr_usd") or 0) >= 10_000 and float(signals.get("support_load_pct") or 0) >= 20:
        findings.append(
            {
                "type": "HIRING_TRIGGER",
                "severity": "warning",
                "importance_score": 72,
                "title": "Customer Success hiring trigger",
                "body": (
                    f"MRR is ${float(profile.get('mrr_usd') or 0):,.0f} and support load is "
                    f"{signals.get('support_load_pct')}%. Consider adding a Customer Success owner."
                ),
            }
        )

    prior_metrics = prior.get("metrics", {}) if isinstance(prior, dict) else {}
    prior_runway = float(prior_metrics.get("runway_months") or 0)
    current_runway = float(profile.get("runway_months") or 0)
    if current_runway and (current_runway < 9 or (prior_runway and current_runway < prior_runway - 1)):
        findings.append(
            {
                "type": "RUNWAY_ALERT",
                "severity": "critical",
                "importance_score": 96,
                "title": "Runway pressure increased",
                "body": (
                    f"Current runway is {current_runway:.1f} months. Burn should be audited immediately and "
                    "non-essential spend should be cut."
                ),
            }
        )

    if float(signals.get("late_night_ratio") or 0) >= 0.2 and float(signals.get("terse_ratio") or 0) >= 0.3:
        findings.append(
            {
                "type": "BURNOUT_ALERT",
                "severity": "warning",
                "importance_score": 78,
                "title": "Founder burnout risk detected",
                "body": (
                    f"Late-night Slack ratio is {signals.get('late_night_ratio')} and terse-reply ratio is "
                    f"{signals.get('terse_ratio')}. Context switching may be degrading decision quality."
                ),
            }
        )

    memo = build_board_memo({**state, "findings": findings})
    return {**state, "findings": findings, "memo": memo}


def compose_mentor_notifications(state: MentorState) -> MentorState:
    notifications = []
    for finding in state.get("findings", []):
        notifications.append(
            {
                "notification_type": finding["type"],
                "severity": finding["severity"],
                "importance_score": finding.get("importance_score", 0),
                "title": finding["title"],
                "body": finding["body"],
                "payload": {"memo": state.get("memo", ""), "signals": state.get("signals", {})},
            }
        )
    if not notifications:
        notifications.append(
            {
                "notification_type": "MENTOR_MEMO",
                "severity": "info",
                "importance_score": 20,
                "title": "Mentor weekly check-in",
                "body": state.get("memo", "No critical strategic alerts."),
                "payload": {"signals": state.get("signals", {})},
            }
        )
    return {**state, "notifications": notifications}
