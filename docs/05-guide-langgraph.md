# 05 — The Guide: LangGraph Reasoning Engine

The Guide is the **Strategic Reasoning Engine**. Unlike the Assistant (which just retrieves and summarises), the Guide reasons in multiple steps, checks the founder's live metrics against industry benchmarks, identifies red flags, and returns a structured decision framework — never a simple yes/no.

---

## The LangGraph State Machine

```
                    ┌──────────────────────┐
                    │  fetch_founder_state │   Node 1
                    │  (Postgres lookup)   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  query_knowledge_base│   Node 2
                    │  Dual-query Pinecone │
                    │  - founder_memory    │
                    │  - startup_playbooks │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  cross_reference     │   Node 3
                    │  GPT-4o: compare     │
                    │  internal vs. bench- │
                    │  mark data           │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  check_red_flags     │   Node 4
                    │  Rule-based checks   │
                    │  on founder profile  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  generate_decision   │   Node 5
                    │  GPT-4o: structured  │
                    │  decision framework  │
                    └──────────┬───────────┘
                               │
                              END
```

---

## Shared State Object

```python
# backend/app/guide/graph.py

class GuideState(TypedDict):
    user_id:         str
    question:        str
    founder_profile: Optional[dict]   # From Postgres startup_profile
    kb_results:      Optional[list]   # Retrieved Pinecone chunks
    analysis:        Optional[str]    # Node 3 output
    red_flags:       list[str]        # Node 4 output
    output:          Optional[str]    # Final decision framework
```

State flows immutably through each node — each node returns `{**state, "new_key": value}`.

---

## Node Implementations

### Node 1 — `fetch_founder_state`

Pulls the founder's live metrics from Postgres `startup_profile`.

```python
def fetch_founder_state(state: dict) -> dict:
    profile = StartupProfile.get_by_user(state["user_id"])
    return {**state, "founder_profile": profile.to_dict() if profile else {}}
```

**Postgres `startup_profile` fields:**

| Field | Type | Example |
|-------|------|---------|
| `stage` | VARCHAR | `"seed"` |
| `mrr_usd` | FLOAT | `18000` |
| `burn_rate_usd` | FLOAT | `45000` |
| `runway_months` | FLOAT | `8.2` |
| `headcount` | INT | `7` |
| `has_cto` | BOOL | `False` |
| `dev_spend_pct` | FLOAT | `0.62` |

This table is **auto-updated** whenever the Assistant processes a relevant email (investor update, hiring offer, financial report).

---

### Node 2 — `query_knowledge_base` (Dual-Query)

```python
def query_knowledge_base(state: dict) -> dict:
    index = pinecone.Index(os.environ["PINECONE_INDEX"])
    vec   = _embed(state["question"])

    # Internal: founder's own context
    internal = index.query(
        vector=vec,
        filter={"user_id": state["user_id"]},
        top_k=5,
        namespace="founder_memory",
        include_metadata=True,
    )

    # External: YC/PG essays / startup playbooks
    external = index.query(
        vector=vec,
        top_k=8,
        namespace="startup_playbooks",
        include_metadata=True,
    )

    kb = [m.metadata for m in internal.matches + external.matches]
    return {**state, "kb_results": kb}
```

---

### Node 3 — `cross_reference_and_analyze`

```
Prompt:
  "Founder profile: {profile}
   Relevant knowledge: {kb_results}
   Question: {question}

   Compare the founder's current metrics against external benchmarks.
   Produce a concise analysis paragraph."
```

---

### Node 4 — `check_red_flags` (Rule Engine)

Hard-coded heuristics that fire before the final output:

```python
def check_red_flags(state: dict) -> dict:
    flags = []
    p = state.get("founder_profile", {})

    if p.get("dev_spend_pct", 0) > 0.6 and not p.get("has_cto"):
        flags.append("Dev spend >60% of burn without a CTO — Danger Zone.")

    if p.get("runway_months", 99) < 6:
        flags.append("Runway < 6 months — hiring decisions need extreme scrutiny.")

    if p.get("mrr_usd", 0) < 10_000 and p.get("stage") == "series-a":
        flags.append("MRR too low for Series A stage — revisit growth strategy first.")

    return {**state, "red_flags": flags}
```

---

### Node 5 — `generate_decision_framework`

```
Prompt:
  "Analysis: {analysis}
   Red Flags: {red_flags}

   Output a structured Decision Framework (NOT a yes/no):
   1. Your current situation vs. industry benchmark.
   2. Key risks if you proceed / don't proceed.
   3. A concrete 3-step action plan used by top-tier startups at this stage."
```

---

## Example: "Should I hire a CTO?"

**Founder profile:** MRR $18k, burn $45k, dev spend 62%, no CTO, 4 contractors

| Node | Output |
|------|--------|
| 1 | Profile loaded: {mrr: 18000, dev_spend_pct: 0.62, has_cto: false, ...} |
| 2 | Retrieved: internal dev spend emails + PG essay "Hiring" + YC "When to hire CTO" |
| 3 | "Founder's dev spend at 62% of burn is above the 40% benchmark for seed. No technical co-founder identified." |
| 4 | 🚩 "Dev spend >60% without CTO — Danger Zone." |
| 5 | "Your dev spend at $27.9k/mo (62% of burn) at $18k MRR puts you in the Danger Zone. The Sequoia benchmark for CTO hire is when dev spend exceeds 50% of burn AND MRR > $15k — you've crossed both thresholds. 3-step plan: 1) Define CTO scope... 2) Run a structured 30-day search... 3) Offer 2-4% equity..." |

---

## Knowledge Base Seeding

The `startup_playbooks` namespace needs to be pre-loaded once:

```bash
# One-time script — run before first deployment
python backend/scripts/seed_knowledge_base.py \
  --sources yc_library,pg_essays,first_round_review
```

Sources are loaded from PDFs/markdown in `backend/data/playbooks/`.
