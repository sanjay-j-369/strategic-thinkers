import pytest
from app.pipeline.pii import strip_pii


def test_strip_person_name():
    text = "John Doe called about the contract."
    result = strip_pii(text)
    assert "John Doe" not in result
    assert "called about the contract" in result


def test_strip_email():
    text = "Please contact john@example.com for details."
    result = strip_pii(text)
    assert "john@example.com" not in result


def test_strip_phone():
    text = "Call me at 555-123-4567 anytime."
    result = strip_pii(text)
    assert "555-123-4567" not in result


def test_no_pii_unchanged():
    text = "The deployment failed on the main branch."
    result = strip_pii(text)
    # Non-PII content should remain largely intact
    assert "deployment" in result
    assert "main branch" in result


def test_multiple_pii_types():
    text = "Sarah Kim (sarah@vc-firm.com) called 555-0199 about the term sheet."
    result = strip_pii(text)
    assert "sarah@vc-firm.com" not in result
    assert "555-0199" not in result


def test_returns_string():
    result = strip_pii("Hello world")
    assert isinstance(result, str)
