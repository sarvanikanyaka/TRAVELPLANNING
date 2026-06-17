from langgraph.graph import StateGraph, START, END
from app.graph.state import PlanState
from app.graph.nodes import retrieval_agent, planner_agent, hotel_agent, attractions_agent, budget_agent

# Initialize StateGraph with the PlanState structure
workflow = StateGraph(PlanState)

# Add our multi-agent nodes
workflow.add_node("retrieval", retrieval_agent)
workflow.add_node("planner", planner_agent)
workflow.add_node("hotel", hotel_agent)
workflow.add_node("attractions", attractions_agent)
workflow.add_node("budget", budget_agent)

# Define standard sequential edges between agents
workflow.add_edge(START, "retrieval")
workflow.add_edge("retrieval", "planner")
workflow.add_edge("planner", "hotel")
workflow.add_edge("hotel", "attractions")
workflow.add_edge("attractions", "budget")
workflow.add_edge("budget", END)

# Compile the graph
app_graph = workflow.compile()
