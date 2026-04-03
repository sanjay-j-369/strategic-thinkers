import re


ACTION_ITEM_PATTERNS = [
    r"\b(can|could|would) you\b",
    r"\bfollow up\b",
    r"\bnext step(s)?\b",
    r"\bby (monday|tuesday|wednesday|thursday|friday|eod|end of day|tomorrow)\b",
    r"\bpromise(d)?\b",
    r"\bneed(s|ed)? to\b",
    r"\bwaiting on\b",
    r"\bblock(ed|er)?\b",
    r"\bunresolved\b",
    r"\baction item(s)?\b",
    r"\btodo\b",
    r"\bETA\b",
]


def detect_action_item_signal(text: str, tags: list[str] | None = None) -> bool:
    """Heuristic signal used for weighting memory retrieval during prep generation."""
    text = (text or "").lower()
    if tags and any(tag in {"customer", "technical", "gtm"} for tag in tags):
        if any(word in text for word in ("follow up", "fix", "blocked", "unresolved", "promise")):
            return True
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in ACTION_ITEM_PATTERNS)
