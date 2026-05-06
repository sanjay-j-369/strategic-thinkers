from __future__ import annotations

import re


PLACEHOLDER_ROLE_REPLACEMENTS = (
    (re.compile(r"<PERSON(?:_[a-f0-9]+)?>", re.IGNORECASE), "an investor"),
    (re.compile(r"<STAKEHOLDER(?:_[a-f0-9]+)?>", re.IGNORECASE), "a stakeholder"),
    (re.compile(r"<RECIPIENT(?:_[a-f0-9]+)?>", re.IGNORECASE), "a recipient"),
    (re.compile(r"<CONTACT(?:_[a-f0-9]+)?>", re.IGNORECASE), "a contact"),
    (re.compile(r"<USER(?:_[a-f0-9]+)?>", re.IGNORECASE), "a team member"),
    (re.compile(r"<SENDER(?:_[a-f0-9]+)?>", re.IGNORECASE), "a team member"),
    (re.compile(r"<NAME(?:_[a-f0-9]+)?>", re.IGNORECASE), "a team member"),
    (re.compile(r"<EMAIL(?:_[a-f0-9]+)?>", re.IGNORECASE), "an email address"),
    (re.compile(r"<PHONE(?:_[a-f0-9]+)?>", re.IGNORECASE), "a phone number"),
)


def sanitize_placeholder_roles(value: str) -> str:
    cleaned = value
    for pattern, replacement in PLACEHOLDER_ROLE_REPLACEMENTS:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


def _risk_sections(state: dict) -> tuple[list[dict], list[dict]]:
    profile = state.get("profile", {}) or {}
    signals = state.get("signals", {}) or {}
    findings = state.get("findings", []) or []
    risk_sections: list[dict] = []
    action_sections: list[dict] = []

    runway = float(profile.get("runway_months") or 0)
    support_load_pct = float(signals.get("support_load_pct") or 0)
    late_night_ratio = float(signals.get("late_night_ratio") or 0)
    terse_ratio = float(signals.get("terse_ratio") or 0)

    for finding in findings:
        finding_type = finding.get("type")
        if finding_type == "RUNWAY_ALERT":
            risk_sections.append(
                {
                    "title": "Runway Risk",
                    "lines": [
                        f"Runway is at {runway:.1f} months, which is below the comfort range for a scaling startup.",
                        "The current burn profile leaves limited room for execution mistakes or delayed fundraising.",
                        "This should stay at the top of the board agenda until the burn curve is clearly reset.",
                    ],
                }
            )
            action_sections.append(
                {
                    "title": "Reset cash discipline",
                    "lines": [
                        "Freeze non-essential spend and review every recurring cost line this week.",
                        "Publish a weekly burn and runway update with a single owner.",
                        "Reconfirm hiring, growth, and fundraising timing against the revised cash plan.",
                    ],
                }
            )
        elif finding_type == "HIRING_TRIGGER":
            risk_sections.append(
                {
                    "title": "Customer Success Coverage Risk",
                    "lines": [
                        f"Support load is at {support_load_pct:.1f}% of recent activity, which signals rising customer pressure.",
                        "That level of demand can start to show up in churn, slower response times, and lost expansion.",
                        "A dedicated owner is becoming important before the load grows further.",
                    ],
                }
            )
            action_sections.append(
                {
                    "title": "Assign customer ownership",
                    "lines": [
                        "Name one team member to own customer follow-up and escalation this week.",
                        "Triage support requests by revenue impact and urgency.",
                        "Track response time, churn risk, and unresolved issues in the weekly board review.",
                    ],
                }
            )
        elif finding_type == "BURNOUT_ALERT":
            risk_sections.append(
                {
                    "title": "Founder Capacity Risk",
                    "lines": [
                        f"Late-night work is at {late_night_ratio:.2f} and terse replies are at {terse_ratio:.2f} in the recent sample.",
                        "That pattern usually means decision quality is getting squeezed by context switching and fatigue.",
                        "If this continues, strategy and execution will both become less reliable.",
                    ],
                }
            )
            action_sections.append(
                {
                    "title": "Protect founder bandwidth",
                    "lines": [
                        "Delegate recurring operational work to a team member this week.",
                        "Cut low-value meetings and create a fixed operating review cadence.",
                        "Reserve one weekly block for strategic decisions only.",
                    ],
                }
            )

    if not risk_sections:
        risk_sections.append(
            {
                "title": "No Immediate Strategic Red Flags",
                "lines": [
                    "The latest context does not show a material runway, hiring, or founder-capacity issue.",
                    "That does not remove the need for weekly monitoring of cash, customer load, and execution rhythm.",
                    "The current plan can hold, provided the same signals stay under review.",
                ],
            }
        )
        action_sections.append(
            {
                "title": "Keep the review cadence tight",
                "lines": [
                    "Review runway, customer demand, and leadership load once per week.",
                    "Escalate immediately if any signal starts to trend in the wrong direction.",
                    "Keep the board memo short, specific, and tied to concrete operating data.",
                ],
            }
        )

    return risk_sections[:3], action_sections[:3]


def build_board_memo(state: dict) -> str:
    risk_sections, action_sections = _risk_sections(state)

    lines: list[str] = ["# Top Strategic Risks", ""]
    for index, section in enumerate(risk_sections, start=1):
        lines.append(f"{index}. **{section['title']}**")
        for line in section["lines"]:
            lines.append(f"   - {sanitize_placeholder_roles(line)}")
        lines.append("")

    lines.extend(["# Recommended Actions", ""])
    for index, section in enumerate(action_sections, start=1):
        lines.append(f"{index}. **{section['title']}**")
        for line in section["lines"]:
            lines.append(f"   - {sanitize_placeholder_roles(line)}")
        lines.append("")

    return "\n".join(lines).strip()