import os
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

_model = SentenceTransformer("all-MiniLM-L6-v2")


def _embed(text: str) -> list[float]:
    return _model.encode(text).tolist()


def _get_pinecone_index():
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", ""))
    return pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))


def _groq_client() -> Groq:
    return Groq(api_key=os.environ.get("GROQ_API_KEY", ""))


def fetch_founder_state(state: dict) -> dict:
    """Node 1 — Pull the founder's live metrics from Postgres startup_profile."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.startup_profile import StartupProfile

    try:
        engine = create_engine(
            os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
        )
        with Session(engine) as session:
            result = session.execute(
                select(StartupProfile).where(
                    StartupProfile.user_id == state["user_id"]
                )
            )
            profile = result.scalar_one_or_none()
            profile_dict = profile.to_dict() if profile else {}
    except Exception:
        profile_dict = {}

    return {**state, "founder_profile": profile_dict}


def query_knowledge_base(state: dict) -> dict:
    """Node 2 — Dual-query Pinecone: founder_memory + startup_playbooks."""
    index = _get_pinecone_index()
    vec = _embed(state["question"])

    internal = index.query(
        vector=vec,
        filter={"user_id": state["user_id"]},
        top_k=5,
        namespace="founder_memory",
        include_metadata=True,
    )

    external = index.query(
        vector=vec,
        top_k=8,
        namespace="startup_playbooks",
        include_metadata=True,
    )

    kb = [m.metadata for m in internal.matches + external.matches]
    return {**state, "kb_results": kb}


def cross_reference_and_analyze(state: dict) -> dict:
    """Node 3 — Groq LLM: compare internal vs. benchmark data."""
    profile = state.get("founder_profile", {})
    kb_results = state.get("kb_results", [])
    question = state.get("question", "")

    kb_text = "\n---\n".join([r.get("text", str(r)) for r in kb_results[:10]])

    prompt = f"""Founder profile: {profile}
Relevant knowledge: {kb_text}
Question: {question}

Compare the founder's current metrics against external benchmarks.
Produce a concise analysis paragraph."""

    response = _groq_client().chat.completions.create(
        model="llama3-70b-8192",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    analysis = response.choices[0].message.content
    return {**state, "analysis": analysis}


def check_red_flags(state: dict) -> dict:
    """Node 4 — Rule-based heuristics on founder profile."""
    flags = []
    p = state.get("founder_profile", {})

    if p.get("dev_spend_pct", 0) > 0.6 and not p.get("has_cto"):
        flags.append("Dev spend >60% of burn without a CTO — Danger Zone.")

    if p.get("runway_months", 99) < 6:
        flags.append("Runway < 6 months — hiring decisions need extreme scrutiny.")

    if p.get("mrr_usd", 0) < 10_000 and p.get("stage") == "series-a":
        flags.append("MRR too low for Series A stage — revisit growth strategy first.")

    return {**state, "red_flags": flags}


def generate_decision_framework(state: dict) -> dict:
    """Node 5 — Groq LLM: structured decision framework."""
    analysis = state.get("analysis", "")
    red_flags = state.get("red_flags", [])
    flags_text = "\n".join(f"🚩 {f}" for f in red_flags) if red_flags else "No critical red flags detected."

    prompt = f"""Analysis: {analysis}
Red Flags: {flags_text}

Output a structured Decision Framework (NOT a yes/no):
1. Your current situation vs. industry benchmark.
2. Key risks if you proceed / don't proceed.
3. A concrete 3-step action plan used by top-tier startups at this stage."""

    response = _groq_client().chat.completions.create(
        model="llama3-70b-8192",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )

    output = response.choices[0].message.content
    return {**state, "output": output}
