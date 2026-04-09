from langgraph.graph import END, StateGraph

from .nodes import MentorState, compose_mentor_notifications, derive_operating_signals, generate_findings, load_profile_and_history


def build_mentor_graph():
    graph = StateGraph(MentorState)
    graph.add_node("load_profile_and_history", load_profile_and_history)
    graph.add_node("derive_operating_signals", derive_operating_signals)
    graph.add_node("generate_findings", generate_findings)
    graph.add_node("compose_mentor_notifications", compose_mentor_notifications)
    graph.set_entry_point("load_profile_and_history")
    graph.add_edge("load_profile_and_history", "derive_operating_signals")
    graph.add_edge("derive_operating_signals", "generate_findings")
    graph.add_edge("generate_findings", "compose_mentor_notifications")
    graph.add_edge("compose_mentor_notifications", END)
    return graph.compile()
