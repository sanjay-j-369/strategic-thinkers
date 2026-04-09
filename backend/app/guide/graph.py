from typing import Optional, TypedDict
from langgraph.graph import StateGraph, END

from app.observability import observe_node
from app.guide.nodes import (
    fetch_founder_state,
    evaluate_company_stage,
    query_knowledge_base,
    cross_reference_and_analyze,
    check_red_flags,
    generate_decision_framework,
)


class GuideState(TypedDict):
    user_id: str
    question: str
    founder_profile: Optional[dict]   # From Postgres startup_profile
    communication_style: Optional[str]
    kb_results: Optional[list]        # Retrieved Pinecone chunks
    analysis: Optional[str]           # Node 3 output
    red_flags: list[str]              # Node 4 output
    output: Optional[str]             # Final decision framework


def build_guide_graph():
    """Build and compile the LangGraph StateGraph with all 5 nodes in sequence."""
    graph = StateGraph(GuideState)

    graph.add_node(
        "fetch_founder_state",
        observe_node(
            pillar="MENTOR",
            agent_name="Guide",
            node_name="fetch_founder_state",
            start_message="[Guide] Loading founder profile from Postgres.",
            end_message="[Guide] Founder profile context loaded.",
        )(fetch_founder_state),
    )
    graph.add_node(
        "evaluate_company_stage",
        observe_node(
            pillar="MENTOR",
            agent_name="Guide",
            node_name="evaluate_company_stage",
            start_message="[Guide] Selecting the response style for the current company stage.",
            end_message="[Guide] Communication style is set.",
        )(evaluate_company_stage),
    )
    graph.add_node(
        "query_knowledge_base",
        observe_node(
            pillar="MENTOR",
            agent_name="Guide",
            node_name="query_knowledge_base",
            start_message="[Guide] Querying Pinecone across founder memory and startup playbooks.",
            end_message=lambda _state, result: (
                f"[Guide] Retrieved {len(result.get('kb_results', []) or [])} knowledge base match(es)."
            ),
        )(query_knowledge_base),
    )
    graph.add_node(
        "cross_reference_and_analyze",
        observe_node(
            pillar="MENTOR",
            agent_name="Guide",
            node_name="cross_reference_and_analyze",
            start_message="[Guide] Cross-referencing internal context against external benchmarks.",
            end_message="[Guide] Comparative analysis is ready.",
        )(cross_reference_and_analyze),
    )
    graph.add_node(
        "check_red_flags",
        observe_node(
            pillar="MENTOR",
            agent_name="Guide",
            node_name="check_red_flags",
            start_message="[Guide] Evaluating heuristic red flags.",
            end_message=lambda _state, result: (
                f"[Guide] Found {len(result.get('red_flags', []) or [])} red flag(s)."
            ),
        )(check_red_flags),
    )
    graph.add_node(
        "generate_decision_framework",
        observe_node(
            pillar="MENTOR",
            agent_name="Guide",
            node_name="generate_decision_framework",
            start_message="[Guide] Drafting the final decision framework.",
            end_message="[Guide] Decision framework generated.",
        )(generate_decision_framework),
    )

    graph.set_entry_point("fetch_founder_state")
    graph.add_edge("fetch_founder_state", "evaluate_company_stage")
    graph.add_edge("evaluate_company_stage", "query_knowledge_base")
    graph.add_edge("query_knowledge_base", "cross_reference_and_analyze")
    graph.add_edge("cross_reference_and_analyze", "check_red_flags")
    graph.add_edge("check_red_flags", "generate_decision_framework")
    graph.add_edge("generate_decision_framework", END)

    return graph.compile()
