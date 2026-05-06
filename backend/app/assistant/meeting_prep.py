import json
import os
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _embed(text: str) -> list[float]:
    return _get_model().encode(text).tolist()


def _groq_client() -> Groq:
    return Groq(api_key=os.environ.get("GROQ_API_KEY", ""))


def _deduplicate(matches: list, score_boost_map: dict[str, float] | None = None) -> list:
    seen: dict[str, tuple[object, float]] = {}
    score_boost_map = score_boost_map or {}
    for match in matches:
        score = float(match.score or 0.0) + float(score_boost_map.get(match.id, 0.0))
        if match.id not in seen or score > seen[match.id][1]:
            seen[match.id] = (match, score)
    return [item[0] for item in sorted(seen.values(), key=lambda row: row[1], reverse=True)]


def _parse_prep_json(raw: str) -> dict:
    if not raw:
        return {}
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
            return {}
    return {}


def _to_str_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


# --- Presentation / sanitization helpers ---
import re
from datetime import datetime, timezone


def _map_entity_to_role(entity: str) -> str:
    if not entity:
        return "Participant"
    e = entity.lower()
    # If it's an email address, map heuristically
    if "@" in e:
        local = e.split("@", 1)[0]
        if "investor" in local or "investor" in e:
            return "Investor"
        if "team" in local or "employee" in local or "teammember" in local or "staff" in local:
            return "Team Member"
        # common role words
        if local in ("ceo", "cto", "cfo", "founder"):
            return "Team Member"
        return "Participant"

    # If name-like string contains role keywords
    if any(x in e for x in ("investor", "vc", "partner")):
        return "Investor"
    if any(x in e for x in ("team", "employee", "engineer", "manager", "founder")):
        return "Team Member"
    return "Participant"


_PLACEHOLDER_RE = re.compile(r"<(EMAIL|PERSON)[^>]*>", flags=re.IGNORECASE)
_EMAIL_IN_TEXT_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}")
_UUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")


def _sanitize_text_placeholders(text: str) -> str:
    if not text:
        return text

    # Replace explicit placeholder tokens like <EMAIL_xxx> or <PERSON_xxx>
    def _repl(m: re.Match) -> str:
        s = m.group(0)
        # try to find an email inside the token
        email_m = _EMAIL_IN_TEXT_RE.search(s)
        if email_m:
            return _map_entity_to_role(email_m.group(0))
        return "Participant"

    out = _PLACEHOLDER_RE.sub(_repl, text)

    # Replace any raw emails with roles where possible
    def _email_repl(m: re.Match) -> str:
        return _map_entity_to_role(m.group(0))

    out = _EMAIL_IN_TEXT_RE.sub(_email_repl, out)

    # Remove UUIDs or long technical ids
    out = _UUID_RE.sub("", out)

    # Collapse excessive whitespace
    out = re.sub(r"\s+", " ", out).strip()
    return out


def _shorten_to_sentences(text: str, max_sentences: int = 3) -> str:
    if not text:
        return ""
    # naive sentence splitter
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    if len(parts) <= max_sentences:
        return " ".join(parts).strip()
    return " ".join(parts[:max_sentences]).strip()


def _build_presentation(topic: str, entities: list[str], generated_at_iso: str, summary: str, promises: list[str], unresolved_loops: list[dict]) -> str:
    # Attendees: map entities to roles and deduplicate preserving order
    roles = []
    for e in entities or []:
        role = _map_entity_to_role(e)
        if role not in roles:
            roles.append(role)

    # Scheduled: use generated_at as fallback readable time
    try:
        dt = datetime.fromisoformat(generated_at_iso)
        scheduled = dt.astimezone(timezone.utc).strftime("%b %d, %Y %H:%M %Z")
    except Exception:
        scheduled = generated_at_iso or "TBD"

    # Clean texts
    summary_clean = _shorten_to_sentences(_sanitize_text_placeholders(summary), max_sentences=3)

    bullets = []
    for p in (promises or []):
        t = _sanitize_text_placeholders(p)
        if t:
            bullets.append(t)
    for loop in (unresolved_loops or []):
        t = _sanitize_text_placeholders(loop.get("text"))
        if t:
            bullets.append(t)

    # Ensure bullets are actionable and unique
    seen = set()
    final_bullets = []
    for b in bullets:
        if b not in seen:
            seen.add(b)
            final_bullets.append(b)

    # Build markdown-like presentation
    lines = []
    lines.append(f"Title: {topic}")
    lines.append("")
    lines.append(f"Attendees: {', '.join(roles) if roles else 'Participant'}")
    lines.append(f"Scheduled: {scheduled}")
    lines.append("")
    lines.append("Summary:")
    lines.append(summary_clean or "No summary available.")
    lines.append("")
    lines.append("Key Prep Points:")
    if final_bullets:
        for b in final_bullets[:8]:
            lines.append(f"- {b}")
    else:
        lines.append("- No specific preparation items identified.")

    return "\n".join(lines)


def generate_prep_card(user_id: str, entities: list[str], topic: str) -> dict:
    """
    Dual-filter Pinecone query + Groq LLM synthesis to generate a meeting prep card.
    """
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", ""))
    index = pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))
    topic_vec = _embed(topic)

    entity_results = index.query(
        vector=topic_vec,
        filter={"user_id": user_id, "entities": {"$in": entities}} if entities else {"user_id": user_id},
        top_k=10,
        namespace="founder_memory",
        include_metadata=True,
    )

    topic_results = index.query(
        vector=topic_vec,
        filter={"user_id": user_id},
        top_k=10,
        namespace="founder_memory",
        include_metadata=True,
    )

    action_item_results = index.query(
        vector=topic_vec,
        filter={"user_id": user_id, "is_action_item": True},
        top_k=6,
        namespace="founder_memory",
        include_metadata=True,
    )

    boost_map = {match.id: 0.35 for match in action_item_results.matches}
    snippets = _deduplicate(
        entity_results.matches + topic_results.matches + action_item_results.matches,
        score_boost_map=boost_map,
    )
    top_snippets = snippets[:12]
    context = "\n---\n".join([m.metadata.get("text", "") for m in top_snippets])
    snippet_sources = [
        {
            "source_url": m.metadata.get("source_url"),
            "topic": m.metadata.get("topic"),
            "is_action_item": bool(m.metadata.get("is_action_item")),
        }
        for m in top_snippets
    ]

    if not context.strip():
        context = "No prior context found for this meeting."

    prompt = f"""You are an executive assistant.
Review these redacted snippets from the last 7 days and output strict JSON.

Return JSON with keys:
- summary: short paragraph
- promises: array of strings
- unresolved_questions: array of strings
- call_goal: one sentence

CONTEXT:
{context}

MEETING TOPIC: {topic}
PARTICIPANTS: {', '.join(entities) if entities else 'Unknown'}"""

    response = _groq_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    llm_output = response.choices[0].message.content or ""
    parsed = _parse_prep_json(llm_output)

    summary = parsed.get("summary") or llm_output
    call_goal = parsed.get("call_goal")
    if isinstance(call_goal, str) and call_goal.strip():
        summary = f"{summary.strip()}\nGoal: {call_goal.strip()}".strip()
    promises = _to_str_list(parsed.get("promises"))
    unresolved_questions = _to_str_list(parsed.get("unresolved_questions"))

    unresolved_loops = []
    action_sources = [
        source for source in snippet_sources if source.get("is_action_item") and source.get("source_url")
    ]
    for idx, loop in enumerate(unresolved_questions[:4]):
        unresolved_loops.append(
            {
                "text": loop,
                "source_url": action_sources[idx]["source_url"] if idx < len(action_sources) else None,
            }
        )

    jump_to_thread_url = None
    for source in action_sources + snippet_sources:
        if source.get("source_url"):
            jump_to_thread_url = source["source_url"]
            break

    return {
        "type": "ASSISTANT_PREP",
        "topic": topic,
        "summary": summary,
        "promises": promises[:3],
        "unresolved_loops": unresolved_loops,
        "jump_to_thread_url": jump_to_thread_url,
        "entities": entities,
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "presentation": _build_presentation(
            topic,
            entities,
            __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            summary,
            promises[:3],
            unresolved_loops,
        ),
    }
