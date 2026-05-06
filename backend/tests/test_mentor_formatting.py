from app.agentic.mentor.formatting import build_board_memo, sanitize_placeholder_roles


def test_board_memo_uses_board_level_structure():
    memo = build_board_memo(
        {
            "profile": {"runway_months": 7.2},
            "signals": {"support_load_pct": 26.4, "late_night_ratio": 0.33, "terse_ratio": 0.41},
            "findings": [
                {"type": "RUNWAY_ALERT", "title": "Runway pressure increased"},
                {"type": "HIRING_TRIGGER", "title": "Customer Success hiring trigger"},
            ],
        }
    )

    assert memo.startswith("# Top Strategic Risks")
    assert "# Recommended Actions" in memo
    assert "1. **Runway Risk**" in memo
    assert "2. **Customer Success Coverage Risk**" in memo
    assert memo.count("   - ") >= 12


def test_placeholder_roles_are_normalized_to_generic_language():
    text = sanitize_placeholder_roles("Discuss this with <PERSON_abcdef1234> and <CONTACT>.")

    assert "<PERSON_abcdef1234>" not in text
    assert "<CONTACT>" not in text
    assert "an investor" in text
    assert "a contact" in text