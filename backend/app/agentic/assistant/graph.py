from langgraph.graph import END, StateGraph

from app.observability import observe_node

from .nodes import AssistantState
from .nodes import (
    compose_assistant_outputs,
    detect_context_routing,
    detect_draft_candidates,
    detect_vip_interruptions,
    extract_commitments,
    load_recent_communications,
)


def build_assistant_graph():
    graph = StateGraph(AssistantState)
    graph.add_node(
        "load_recent_communications",
        observe_node(
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            node_name="load_recent_communications",
            start_message="[Assistant] Loading recent communications from founder memory.",
            end_message=lambda _state, result: (
                f"[Assistant] Loaded {len(result.get('recent_items', []))} recent communication item(s)."
            ),
        )(load_recent_communications),
    )
    graph.add_node(
        "extract_commitments",
        observe_node(
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            node_name="extract_commitments",
            start_message="[Assistant] Scanning for founder commitments and follow-ups.",
            end_message=lambda _state, result: (
                f"[Assistant] Identified {len(result.get('promises', []))} commitment candidate(s)."
            ),
        )(extract_commitments),
    )
    graph.add_node(
        "detect_draft_candidates",
        observe_node(
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            node_name="detect_draft_candidates",
            start_message="[Assistant] Drafting candidate replies for important inbound requests.",
            end_message=lambda _state, result: (
                f"[Assistant] Prepared {len(result.get('drafts', []))} draft reply candidate(s)."
            ),
        )(detect_draft_candidates),
    )
    graph.add_node(
        "detect_vip_interruptions",
        observe_node(
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            node_name="detect_vip_interruptions",
            start_message="[Assistant] Checking for investor and VIP interruptions.",
            end_message=lambda _state, result: (
                f"[Assistant] Flagged {len(result.get('vip_alerts', []))} VIP interruption(s)."
            ),
        )(detect_vip_interruptions),
    )
    graph.add_node(
        "detect_context_routing",
        observe_node(
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            node_name="detect_context_routing",
            start_message="[Assistant] Looking for juggling-style context routing opportunities.",
            end_message=lambda _state, result: (
                f"[Assistant] Prepared {len(result.get('routing_tasks', []))} context routing draft(s)."
            ),
        )(detect_context_routing),
    )
    graph.add_node(
        "compose_assistant_outputs",
        observe_node(
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            node_name="compose_assistant_outputs",
            start_message="[Assistant] Composing the final assistant briefing and notifications.",
            end_message=lambda _state, result: (
                f"[Assistant] Emitted {len(result.get('notifications', []))} assistant notification(s)."
            ),
        )(compose_assistant_outputs),
    )
    graph.set_entry_point("load_recent_communications")
    graph.add_edge("load_recent_communications", "extract_commitments")
    graph.add_edge("extract_commitments", "detect_draft_candidates")
    graph.add_edge("detect_draft_candidates", "detect_vip_interruptions")
    graph.add_edge("detect_vip_interruptions", "detect_context_routing")
    graph.add_edge("detect_context_routing", "compose_assistant_outputs")
    graph.add_edge("compose_assistant_outputs", END)
    return graph.compile()
