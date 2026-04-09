from langgraph.graph import END, StateGraph

from .nodes import WorkerState, compose_operator_alert, identify_blockers, load_lane_context


def build_worker_graph():
    graph = StateGraph(WorkerState)
    graph.add_node("load_lane_context", load_lane_context)
    graph.add_node("identify_blockers", identify_blockers)
    graph.add_node("compose_operator_alert", compose_operator_alert)
    graph.set_entry_point("load_lane_context")
    graph.add_edge("load_lane_context", "identify_blockers")
    graph.add_edge("identify_blockers", "compose_operator_alert")
    graph.add_edge("compose_operator_alert", END)
    return graph.compile()
