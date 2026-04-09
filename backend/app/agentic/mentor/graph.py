from langgraph.graph import END, StateGraph

from app.observability import observe_node

from .nodes import MentorState, compose_mentor_notifications, derive_operating_signals, generate_findings, load_profile_and_history


def build_mentor_graph():
    graph = StateGraph(MentorState)
    graph.add_node(
        "load_profile_and_history",
        observe_node(
            pillar="MENTOR",
            agent_name="Board Member",
            node_name="load_profile_and_history",
            start_message="[Board Member] Loading founder profile and prior mentor snapshot.",
            end_message="[Board Member] Profile context is ready.",
        )(load_profile_and_history),
    )
    graph.add_node(
        "derive_operating_signals",
        observe_node(
            pillar="MENTOR",
            agent_name="Board Member",
            node_name="derive_operating_signals",
            start_message="[Board Member] Deriving operating signals from recent communications.",
            end_message=lambda _state, result: (
                f"[Board Member] Derived signals from {result.get('signals', {}).get('recent_message_count', 0)} recent messages."
            ),
        )(derive_operating_signals),
    )
    graph.add_node(
        "generate_findings",
        observe_node(
            pillar="MENTOR",
            agent_name="Board Member",
            node_name="generate_findings",
            start_message="[Board Member] Generating strategic findings and weekly memo.",
            end_message=lambda _state, result: (
                f"[Board Member] Produced {len(result.get('findings', []))} strategic finding(s)."
            ),
        )(generate_findings),
    )
    graph.add_node(
        "compose_mentor_notifications",
        observe_node(
            pillar="MENTOR",
            agent_name="Board Member",
            node_name="compose_mentor_notifications",
            start_message="[Board Member] Packaging mentor notifications for the founder feed.",
            end_message=lambda _state, result: (
                f"[Board Member] Emitted {len(result.get('notifications', []))} mentor notification(s)."
            ),
        )(compose_mentor_notifications),
    )
    graph.set_entry_point("load_profile_and_history")
    graph.add_edge("load_profile_and_history", "derive_operating_signals")
    graph.add_edge("derive_operating_signals", "generate_findings")
    graph.add_edge("generate_findings", "compose_mentor_notifications")
    graph.add_edge("compose_mentor_notifications", END)
    return graph.compile()
