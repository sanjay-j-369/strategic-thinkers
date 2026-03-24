from typing import Optional, TypedDict
from langgraph.graph import StateGraph, END

from app.guide.nodes import (
    fetch_founder_state,
    query_knowledge_base,
    cross_reference_and_analyze,
    check_red_flags,
    generate_decision_framework,
)


class GuideState(TypedDict):
    user_id: str
    question: str
    founder_profile: Optional[dict]   # From Postgres startup_profile
    kb_results: Optional[list]        # Retrieved Pinecone chunks
    analysis: Optional[str]           # Node 3 output
    red_flags: list[str]              # Node 4 output
    output: Optional[str]             # Final decision framework


def build_guide_graph():
    """Build and compile the LangGraph StateGraph with all 5 nodes in sequence."""
    graph = StateGraph(GuideState)

    graph.add_node("fetch_founder_state", fetch_founder_state)
    graph.add_node("query_knowledge_base", query_knowledge_base)
    graph.add_node("cross_reference_and_analyze", cross_reference_and_analyze)
    graph.add_node("check_red_flags", check_red_flags)
    graph.add_node("generate_decision_framework", generate_decision_framework)

    graph.set_entry_point("fetch_founder_state")
    graph.add_edge("fetch_founder_state", "query_knowledge_base")
    graph.add_edge("query_knowledge_base", "cross_reference_and_analyze")
    graph.add_edge("cross_reference_and_analyze", "check_red_flags")
    graph.add_edge("check_red_flags", "generate_decision_framework")
    graph.add_edge("generate_decision_framework", END)

    return graph.compile()
