from app.api.routes.chat import _build_system_prompt, _redact_chat_payload, _resolve_context_tags


def test_worker_system_prompt_keeps_workspace_context():
    prompt = _build_system_prompt(
        "You are a hiring advisor.",
        "[gmail] Marcus Rodriguez asked about Series B timing.",
        ["hiring", "candidates"],
    )

    assert "You are a hiring advisor." in prompt
    assert "Marcus Rodriguez asked about Series B timing" in prompt
    assert "latest updates" in prompt
    assert "generic best practices" in prompt
    assert "hiring, candidates" in prompt


def test_worker_key_resolves_context_tags():
    tags = _resolve_context_tags("hiring-agent", [])

    assert "hiring" in tags
    assert "candidates" in tags


def test_chat_payload_redacts_user_pii_before_llm():
    message, history, system_prompt, mapping = _redact_chat_payload(
        "Ask Jane Parker at jane@example.com about the contract.",
        [{"role": "user", "content": "Call me at 555-123-4567."}],
        "You advise Alex Kim.",
    )

    combined = "\n".join([message, *(item["content"] for item in history), system_prompt or ""])
    assert "Jane Parker" not in combined
    assert "jane@example.com" not in combined
    assert "555-123-4567" not in combined
    assert "Alex Kim" not in combined
    assert "<EMAIL_" in combined
    assert "jane@example.com" in mapping.values()
