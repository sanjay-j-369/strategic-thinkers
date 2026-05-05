from app.pipeline.pii import restore_pii_tokens, strip_pii, tokenize_pii


def test_strip_person_name():
    text = "John Doe called about the contract."
    redacted, mapping = strip_pii(text)
    assert "John Doe" not in redacted
    assert "called about the contract" in redacted
    assert list(mapping.values()) == ["John Doe"]


def test_strip_email():
    text = "Please contact john@example.com for details."
    redacted, mapping = strip_pii(text)
    assert "john@example.com" not in redacted
    assert list(mapping.values()) == ["john@example.com"]


def test_strip_phone():
    text = "Call me at 555-123-4567 anytime."
    redacted, mapping = strip_pii(text)
    assert "555-123-4567" not in redacted
    assert list(mapping.values()) == ["555-123-4567"]


def test_no_pii_unchanged():
    text = "The deployment failed on the main branch."
    redacted, mapping = strip_pii(text)
    # Non-PII content should remain largely intact
    assert "deployment" in redacted
    assert "main branch" in redacted
    assert mapping == {}


def test_multiple_pii_types():
    text = "Sarah Kim (sarah@vc-firm.com) called 555-0199 about the term sheet."
    redacted, mapping = strip_pii(text)
    assert "sarah@vc-firm.com" not in redacted
    assert "555-0199" not in redacted
    assert "Sarah Kim" in mapping.values()
    assert "sarah@vc-firm.com" in mapping.values()
    assert "555-0199" in mapping.values()


def test_tokenize_preserves_existing_tokens():
    redacted, mapping = tokenize_pii("Follow up with <PERSON_abcdef1234> at jane@example.com.")
    assert "<PERSON_abcdef1234>" in redacted
    assert "jane@example.com" not in redacted
    assert list(mapping.values()) == ["jane@example.com"]


def test_restore_plain_mapping_roundtrip():
    text = "Email Priya Shah at priya@example.com."
    redacted, mapping = tokenize_pii(text)
    assert restore_pii_tokens(redacted, mapping) == text
