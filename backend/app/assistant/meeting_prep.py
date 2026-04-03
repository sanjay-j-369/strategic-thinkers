import json
import os
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

_model = SentenceTransformer("all-MiniLM-L6-v2")


def _embed(text: str) -> list[float]:
    return _model.encode(text).tolist()


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
    }
