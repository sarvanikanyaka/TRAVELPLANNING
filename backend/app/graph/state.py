from typing import TypedDict, List, Dict, Any, Optional

class PlanState(TypedDict):
    # Inputs
    destination: str
    budget: float
    days: int
    provider: str
    api_key: Optional[str]
    
    # Outputs/Intermediate state
    planner_skeleton: Optional[Dict[str, Any]]      # Outline of daily themes
    hotels: Optional[List[Dict[str, Any]]]           # Lodging details
    attractions: Optional[List[Dict[str, Any]]]     # Sights and activities
    restaurants: Optional[List[Dict[str, Any]]]     # Dining spots
    daily_itinerary: Optional[List[Dict[str, Any]]] # Combined day-by-day plans
    budget_breakdown: Optional[Dict[str, Any]]      # Financial details and status
    
    # Workflow status
    error: Optional[str]
