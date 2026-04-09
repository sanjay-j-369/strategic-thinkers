from langgraph.graph import END, StateGraph

from .nodes import AssistantState
from .nodes import (
    compose_assistant_outputs,
    detect_draft_candidates,
    detect_vip_interruptions,
    extract_commitments,
    load_recent_communications,
)


def build_assistant_graph():
    graph = StateGraph(AssistantState)
    graph.add_node("load_recent_communications", load_recent_communications)
    graph.add_node("extract_commitments", extract_commitments)
    graph.add_node("detect_draft_candidates", detect_draft_candidates)
    graph.add_node("detect_vip_interruptions", detect_vip_interruptions)
    graph.add_node("compose_assistant_outputs", compose_assistant_outputs)
    graph.set_entry_point("load_recent_communications")
    graph.add_edge("load_recent_communications", "extract_commitments")
    graph.add_edge("extract_commitments", "detect_draft_candidates")
    graph.add_edge("detect_draft_candidates", "detect_vip_interruptions")
    graph.add_edge("detect_vip_interruptions", "compose_assistant_outputs")
    graph.add_edge("compose_assistant_outputs", END)
    return graph.compile()
