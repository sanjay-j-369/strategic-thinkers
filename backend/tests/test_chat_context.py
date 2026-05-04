from app.api.routes.chat import _build_system_prompt, _resolve_context_tags


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
