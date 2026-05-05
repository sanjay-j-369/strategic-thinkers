from __future__ import annotations

import re
import uuid

from app.pipeline.encryption import encrypt
from app.pipeline.asymmetric_encryption import encrypt_with_public_key

try:
    from presidio_analyzer import AnalyzerEngine
except Exception:  # pragma: no cover - optional runtime dependency/model setup
    AnalyzerEngine = None


_analyzer: AnalyzerEngine | None = None

PII_TOKEN_PATTERN = re.compile(r"<[A-Z_]+_[a-f0-9]+>")
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)"
)
SHORT_PHONE_PATTERN = re.compile(r"(?<!\w)\d{3}[\s.-]\d{4}(?!\w)")
SSN_PATTERN = re.compile(r"(?<!\w)\d{3}-\d{2}-\d{4}(?!\w)")
PERSON_PATTERN = re.compile(
    r"\b(?:[A-Z][a-z]+|[A-Z][a-z]+'[A-Z][a-z]+)(?:\s+(?:[A-Z][a-z]+|[A-Z][a-z]+'[A-Z][a-z]+)){1,3}\b"
)

PERSON_FALSE_STARTS = {
    "A",
    "An",
    "And",
    "As",
    "Call",
    "Contact",
    "From",
    "Hello",
    "Meeting",
    "No",
    "Please",
    "Subject",
    "The",
    "This",
}
ENTITY_NAMES = {
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "US_SSN": "SSN",
    "PERSON": "PERSON",
}


def _get_analyzer() -> AnalyzerEngine | None:
    global _analyzer
    if AnalyzerEngine is None:
        return None
    if _analyzer is not None:
        return _analyzer
    try:
        _analyzer = AnalyzerEngine()
        return _analyzer
    except Exception:
        return None


def _token_for_entity(entity_type: str) -> str:
    safe_type = re.sub(r"[^A-Z0-9_]", "_", entity_type.upper())
    return f"<{safe_type}_{uuid.uuid4().hex[:10]}>"


def _overlaps_existing_token(text: str, start: int, end: int) -> bool:
    return any(match.start() < end and start < match.end() for match in PII_TOKEN_PATTERN.finditer(text))


def _add_span(spans: list[dict], text: str, start: int, end: int, entity_type: str, score: float = 1.0) -> None:
    if start >= end or _overlaps_existing_token(text, start, end):
        return
    value = text[start:end].strip()
    if not value:
        return
    spans.append(
        {
            "start": start,
            "end": end,
            "entity_type": ENTITY_NAMES.get(entity_type, entity_type),
            "score": score,
        }
    )


def _regex_spans(text: str) -> list[dict]:
    spans: list[dict] = []
    for pattern, entity_type in (
        (EMAIL_PATTERN, "EMAIL"),
        (PHONE_PATTERN, "PHONE"),
        (SHORT_PHONE_PATTERN, "PHONE"),
        (SSN_PATTERN, "SSN"),
    ):
        for match in pattern.finditer(text):
            _add_span(spans, text, match.start(), match.end(), entity_type)

    for match in PERSON_PATTERN.finditer(text):
        first_word = match.group(0).split()[0]
        if first_word in PERSON_FALSE_STARTS:
            continue
        if EMAIL_PATTERN.search(match.group(0)):
            continue
        _add_span(spans, text, match.start(), match.end(), "PERSON", score=0.6)
    return spans


def _presidio_spans(text: str, language: str) -> list[dict]:
    analyzer = _get_analyzer()
    if analyzer is None:
        return []
    try:
        results = analyzer.analyze(
            text=text,
            language=language,
            entities=["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "US_SSN"],
        )
    except Exception:
        return []
    return [
        {
            "start": result.start,
            "end": result.end,
            "entity_type": ENTITY_NAMES.get(result.entity_type, result.entity_type),
            "score": float(result.score or 0.0),
        }
        for result in results
    ]


def _merge_spans(spans: list[dict]) -> list[dict]:
    ordered = sorted(spans, key=lambda item: (item["start"], -(item["end"] - item["start"]), -item["score"]))
    merged: list[dict] = []
    for span in ordered:
        if not merged or span["start"] >= merged[-1]["end"]:
            merged.append(span)
            continue
        current = merged[-1]
        span_len = span["end"] - span["start"]
        current_len = current["end"] - current["start"]
        if span_len > current_len or (span_len == current_len and span["score"] > current["score"]):
            merged[-1] = span
    return merged


def tokenize_pii(text: str, language: str = "en") -> tuple[str, dict[str, str]]:
    """Replace PII with opaque tokens and return a plain token->value map."""
    if not text:
        return text, {}

    spans = _merge_spans([*_presidio_spans(text, language), *_regex_spans(text)])
    if not spans:
        return text, {}

    value_tokens: dict[tuple[str, str], str] = {}
    token_values: dict[str, str] = {}
    redacted_parts: list[str] = []
    cursor = 0

    for span in spans:
        start = max(span["start"], cursor)
        end = span["end"]
        if start >= end:
            continue

        value = text[start:end]
        key = (span["entity_type"], value)
        token = value_tokens.get(key)
        if token is None:
            token = _token_for_entity(span["entity_type"])
            value_tokens[key] = token
            token_values[token] = value

        redacted_parts.append(text[cursor:start])
        redacted_parts.append(token)
        cursor = end

    redacted_parts.append(text[cursor:])
    return "".join(redacted_parts), token_values


def encrypt_pii_mapping(
    mapping: dict[str, str],
    user_id: str | None = None,
    user_public_key: str | None = None,
) -> dict[str, str]:
    if user_public_key:
        return {
            token: encrypt_with_public_key(user_public_key, value)
            for token, value in mapping.items()
        }
    if user_id:
        return {token: encrypt(user_id, value) for token, value in mapping.items()}
    return mapping


def restore_pii_tokens(text: str, mapping: dict[str, str]) -> str:
    restored = text
    for token, value in mapping.items():
        restored = restored.replace(token, value)
    return restored

def strip_pii(
    text: str,
    user_id: str = None,
    language: str = "en",
    user_public_key: str | None = None,
) -> tuple[str, dict[str, str]]:
    redacted, plain_mapping = tokenize_pii(text, language=language)
    return redacted, encrypt_pii_mapping(
        plain_mapping,
        user_id=user_id,
        user_public_key=user_public_key,
    )
