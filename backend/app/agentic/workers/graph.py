from langgraph.graph import END, StateGraph

from app.observability import observe_node

from .nodes import WorkerState, compose_operator_alert, identify_blockers, load_lane_context


def build_worker_graph():
    graph = StateGraph(WorkerState)
    graph.add_node(
        "load_lane_context",
        observe_node(
            pillar="WORKER",
            agent_name="AI Worker",
            node_name="load_lane_context",
            start_message=lambda state: (
                f"[{state.get('lane', 'worker').upper()} Worker] Querying founder memory for lane context."
            ),
            end_message=lambda _state, result: (
                f"[AI Worker] Loaded {len(result.get('context_items', []))} context item(s) for blocker analysis."
            ),
        )(load_lane_context),
    )
    graph.add_node(
        "identify_blockers",
        observe_node(
            pillar="WORKER",
            agent_name="AI Worker",
            node_name="identify_blockers",
            start_message=lambda state: (
                f"[{state.get('lane', 'worker').upper()} Worker] Summarizing likely blockers."
            ),
            end_message=lambda _state, result: (
                f"[AI Worker] Found {len(result.get('blockers', []))} blocker candidate(s)."
            ),
        )(identify_blockers),
    )
    graph.add_node(
        "compose_operator_alert",
        observe_node(
            pillar="WORKER",
            agent_name="AI Worker",
            node_name="compose_operator_alert",
            start_message="[AI Worker] Drafting operator alert for surfaced blockers.",
            end_message=lambda _state, result: (
                "[AI Worker] Operator alert ready."
                if result.get("notification")
                else "[AI Worker] No operator alert was necessary."
            ),
        )(compose_operator_alert),
    )
    graph.set_entry_point("load_lane_context")
    graph.add_edge("load_lane_context", "identify_blockers")
    graph.add_edge("identify_blockers", "compose_operator_alert")
    graph.add_edge("compose_operator_alert", END)
    return graph.compile()
