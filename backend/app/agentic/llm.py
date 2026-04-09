from __future__ import annotations

import json
import os

from groq import Groq


def _client() -> Groq | None:
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return None
    return Groq(api_key=api_key)


def complete_text(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 700,
    fallback: str = "",
) -> str:
    client = _client()
    if client is None:
        return fallback
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or fallback
    except Exception:
        return fallback


def complete_json(prompt: str, *, fallback: dict | None = None) -> dict:
    raw = complete_text(prompt, temperature=0.0, fallback=json.dumps(fallback or {}))
    try:
        return json.loads(raw)
    except Exception:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except Exception:
            pass
    return fallback or {}
