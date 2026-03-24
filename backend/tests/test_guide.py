import pytest
from app.guide.nodes import check_red_flags


def _make_state(overrides: dict = {}) -> dict:
    base = {
        "user_id": "test-user-123",
        "question": "Should I hire a CTO?",
        "founder_profile": {
            "stage": "seed",
            "mrr_usd": 18000,
            "burn_rate_usd": 45000,
            "runway_months": 8.2,
            "headcount": 7,
            "has_cto": False,
            "dev_spend_pct": 0.62,
        },
        "kb_results": [],
        "analysis": None,
        "red_flags": [],
        "output": None,
    }
    base.update(overrides)
    return base


def test_dev_spend_flag():
    state = _make_state()
    result = check_red_flags(state)
    flags = result["red_flags"]
    assert any("Dev spend" in f for f in flags)


def test_runway_flag():
    state = _make_state({"founder_profile": {
        "stage": "seed",
        "mrr_usd": 18000,
        "burn_rate_usd": 45000,
        "runway_months": 4,
        "headcount": 7,
        "has_cto": False,
        "dev_spend_pct": 0.3,
    }})
    result = check_red_flags(state)
    flags = result["red_flags"]
    assert any("Runway" in f for f in flags)


def test_series_a_mrr_flag():
    state = _make_state({"founder_profile": {
        "stage": "series-a",
        "mrr_usd": 5000,
        "burn_rate_usd": 80000,
        "runway_months": 12,
        "headcount": 10,
        "has_cto": True,
        "dev_spend_pct": 0.4,
    }})
    result = check_red_flags(state)
    flags = result["red_flags"]
    assert any("MRR" in f for f in flags)


def test_no_flags_healthy_startup():
    state = _make_state({"founder_profile": {
        "stage": "seed",
        "mrr_usd": 25000,
        "burn_rate_usd": 40000,
        "runway_months": 14,
        "headcount": 5,
        "has_cto": True,
        "dev_spend_pct": 0.35,
    }})
    result = check_red_flags(state)
    assert result["red_flags"] == []


def test_state_passthrough():
    """check_red_flags should preserve all existing state keys."""
    state = _make_state()
    result = check_red_flags(state)
    assert result["user_id"] == state["user_id"]
    assert result["question"] == state["question"]
    assert "red_flags" in result
