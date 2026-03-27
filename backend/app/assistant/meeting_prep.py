import os
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

_model = SentenceTransformer("all-MiniLM-L6-v2")


def _embed(text: str) -> list[float]:
    return _model.encode(text).tolist()


def _groq_client() -> Groq:
    return Groq(api_key=os.environ.get("GROQ_API_KEY", ""))


def _deduplicate(matches: list) -> list:
    seen = {}
    for match in matches:
        if match.id not in seen or match.score > seen[match.id].score:
            seen[match.id] = match
    return sorted(seen.values(), key=lambda m: m.score, reverse=True)


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

    snippets = _deduplicate(entity_results.matches + topic_results.matches)
    context = "\n---\n".join([m.metadata.get("text", "") for m in snippets[:10]])

    if not context.strip():
        context = "No prior context found for this meeting."

    prompt = f"""You are an executive assistant.
Review these redacted snippets from the last 7 days.

Summarize:
1. The last thing we promised them.
2. Any 'hot' friction points.
3. The suggested goal for this 30-min call.

CONTEXT:
{context}

MEETING TOPIC: {topic}
PARTICIPANTS: {', '.join(entities) if entities else 'Unknown'}"""

    response = _groq_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    summary = response.choices[0].message.content

    return {
        "type": "ASSISTANT_PREP",
        "topic": topic,
        "summary": summary,
        "entities": entities,
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
