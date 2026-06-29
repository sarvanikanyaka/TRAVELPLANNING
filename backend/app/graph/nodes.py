from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
from app.graph.state import PlanState
from app.observability import trace_graph_node, logger
from app.services.rag_service import rag_service, detect_currency

# Define Pydantic response structures for each agent to use with .with_structured_output()

class PlannerSkeletonOutput(BaseModel):
    themes: List[str] = Field(description="Main theme/vibe for each day (e.g., 'Historical Tour of Asakusa', 'Modern Tech in Akihabara'). Must match the number of days exactly.")
    areas: List[str] = Field(description="Primary geographic area/neighborhood for each day (e.g., 'Shibuya', 'Shinjuku'). Must match the number of days exactly.")
    rationale: str = Field(description="Short rationale behind the flow of this itinerary skeleton.")

class HotelDetails(BaseModel):
    name: str = Field(description="Name of the hotel")
    description: str = Field(description="General description of the hotel and amenities")
    rating: str = Field(description="Hotel star rating or customer rating (e.g., '4.5 stars')")
    price_per_night: float = Field(description="Estimated price per night in the local currency")
    location: str = Field(description="Neighborhood or district the hotel is in")

class HotelAgentOutput(BaseModel):
    hotels: List[HotelDetails] = Field(description="Exactly 3 hotel recommendations matching the destination and budget: 1 Budget option, 1 Mid-Range option, and 1 Luxury option.")

class AttractionDetails(BaseModel):
    name: str = Field(description="Name of the tourist spot or activity")
    description: str = Field(description="Short description of what to do/see")
    category: str = Field(description="Category (e.g. Historic, Nature, Museum, Shopping, Entertainment)")
    cost: float = Field(description="Estimated cost per person in the local currency (0 for free attractions)")
    duration: str = Field(description="Approximate duration of visit (e.g., '2 hours')")
    recommended_time: str = Field(description="Best time to visit (e.g., 'Morning', 'Afternoon', 'Evening')")

class RestaurantDetails(BaseModel):
    name: str = Field(description="Name of the restaurant")
    description: str = Field(description="Brief summary of vibe or signature dishes")
    cuisine: str = Field(description="Cuisine type (e.g. Japanese, Italian, Street Food)")
    average_cost: float = Field(description="Average cost per person in the local currency")
    location: str = Field(description="General neighborhood location")

class DailyPlan(BaseModel):
    day_number: int = Field(description="The index of the day (e.g., 1, 2, 3...)")
    theme: str = Field(description="The theme of the day, matching the planner skeleton")
    activities: List[AttractionDetails] = Field(description="List of 2-3 attractions/activities for this day")
    restaurants: List[RestaurantDetails] = Field(description="List of 2 dining recommendations (Lunch, Dinner)")
    routing_notes: str = Field(description="Transit and route logistics tips (e.g., walking, taking the metro line)")

class AttractionsAgentOutput(BaseModel):
    daily_plans: List[DailyPlan] = Field(description="List of daily plans matching the total number of days")

class BudgetAgentOutput(BaseModel):
    hotel_costs: float = Field(description="Sum of hotel costs in the local currency (calculated for the chosen hotel classification multiplied by the number of nights, which is days - 1)")
    activity_costs: float = Field(description="Sum of all attraction costs for the trip in the local currency")
    food_costs: float = Field(description="Estimated total cost of meals for the duration of the trip in the local currency")
    transport_costs: float = Field(description="Estimated total cost of local transit (metro, taxis) in the local currency")
    total_cost: float = Field(description="Sum of hotel_costs, activity_costs, food_costs, and transport_costs in the local currency")
    status: str = Field(description="Trip status: 'within_budget' if total_cost <= budget, otherwise 'over_budget'")
    suggestions: str = Field(description="Detailed notes on how the plan fits the budget. If over_budget, details of adjustments made (e.g. recommending budget hotel or free activities) or options for the user.")
    selected_hotel_name: str = Field(description="Name of the hotel selected to stay within budget (must be one of the three options from the Hotel Agent)")

# Helper to initialize the correct LLM
def get_llm(provider: str, custom_key: Optional[str] = None, model_name: Optional[str] = None):
    if provider.lower() == "openai":
        api_key = custom_key or settings.OPENAI_API_KEY
        if not api_key:
            raise ValueError("OpenAI API key is missing. Please provide it in the UI or environment.")
        return ChatOpenAI(
            model=model_name or "gpt-4o-mini",
            openai_api_key=api_key,
            temperature=0.2
        )
    elif provider.lower() == "gemini":
        api_key = custom_key or settings.GOOGLE_API_KEY
        if not api_key:
            raise ValueError("Gemini API key is missing. Please provide it in the UI or environment.")
        return ChatGoogleGenerativeAI(
            model=model_name or "gemini-1.5-flash-latest",
            google_api_key=api_key,
            temperature=0.2
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")

# Robust LLM Invocation with Fallback Model Names
def invoke_with_fallback(provider: str, api_key: Optional[str], schema, prompt: str):
    """
    Invokes LLM and automatically falls back to alternative model identifiers if a 404 or support error occurs.
    """
    if provider.lower() == "openai":
        llm = get_llm(provider, api_key)
        structured_llm = llm.with_structured_output(schema)
        return structured_llm.invoke(prompt)
        
    elif provider.lower() == "gemini":
        # List of models to try in sequence
        models_to_try = [
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-pro"
        ]
        
        last_exception = None
        for model_name in models_to_try:
            try:
                logger.info(f"Attempting Gemini invoke with model: {model_name}")
                llm = get_llm(provider, api_key, model_name)
                structured_llm = llm.with_structured_output(schema)
                return structured_llm.invoke(prompt)
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {str(e)}")
                last_exception = e
                # Continue to next model fallback
                continue
        
        # If all failed, raise the final exception
        raise last_exception
    else:
        raise ValueError(f"Unsupported provider: {provider}")

@trace_graph_node("Retrieval Agent")
def retrieval_agent(state: PlanState) -> PlanState:
    """Retrieval Agent: Dynamically detects currency and fetches RAG guidebook context."""
    try:
        currency, symbol = detect_currency(state["destination"])
        state["currency"] = currency
        state["currency_symbol"] = symbol
        
        context = rag_service.retrieve_context(
            destination=state["destination"],
            provider=state["provider"],
            custom_key=state["api_key"]
        )
        state["retrieved_context"] = context
        state["error"] = None
    except Exception as e:
        state["error"] = f"Retrieval Agent failed: {str(e)}"
    return state

@trace_graph_node("Planner Agent")
def planner_agent(state: PlanState) -> PlanState:
    """Planner Agent: Formulates the theme and geographic focus for each day."""
    if state.get("error"):
        return state
        
    try:
        curr = state.get("currency", "USD")
        sym = state.get("currency_symbol", "$")
        
        prompt = (
            f"You are a master Travel Planner Agent.\n"
            f"Design the overall skeleton itinerary for a {state['days']}-day trip to {state['destination']} "
            f"with a budget of {sym}{state['budget']} {curr}.\n"
            f"All financial calculations, values, and estimates must be in the local currency: {curr} ({sym}).\n"
            f"Provide a theme/vibe and a primary neighborhood focus for each day.\n"
            f"Make sure the number of themes and areas is exactly {state['days']}.\n"
            f"Keep travel logistics smooth and group activities geographically."
        )
        
        response = invoke_with_fallback(state["provider"], state["api_key"], PlannerSkeletonOutput, prompt)
        state["planner_skeleton"] = response.model_dump()
    except Exception as e:
        state["error"] = f"Planner Agent failed: {str(e)}"
    
    return state

@trace_graph_node("Hotel Agent")
def hotel_agent(state: PlanState) -> PlanState:
    """Hotel Agent: Finds suitable lodging options matching the destination and budget, utilizing RAG context."""
    if state.get("error"):
        return state
        
    try:
        curr = state.get("currency", "USD")
        sym = state.get("currency_symbol", "$")
        
        context_str = ""
        if state.get("retrieved_context"):
            context_str = "\n".join([f"- {c}" for c in state["retrieved_context"]])
            context_prompt = f"\nUse the following verified local travel facts (RAG Context) to find lodging prices and amenities if relevant:\n{context_str}\n"
        else:
            context_prompt = ""
            
        prompt = (
            f"You are a lodging specialist Hotel Agent.\n"
            f"Suggest 3 lodging recommendations for a {state['days']}-day trip to {state['destination']}.\n"
            f"The overall trip budget is {sym}{state['budget']} {curr}.\n"
            f"All hotel prices and totals MUST be calculated and output in the local currency: {curr} ({sym}).\n"
            f"You must recommend exactly 3 options:\n"
            f"1. A Budget option (economic, basic amenities, good value)\n"
            f"2. A Mid-Range option (comfortable, good location, standard amenities)\n"
            f"3. A Luxury option (premium hotel/resort, high-end experience)\n"
            f"{context_prompt}\n"
            f"Estimate the price per night in {curr} and calculate the total cost for {state['days'] - 1} nights (since it is a {state['days']}-day trip)."
        )
        
        response = invoke_with_fallback(state["provider"], state["api_key"], HotelAgentOutput, prompt)
        hotels_list = []
        for h in response.hotels:
            total = h.price_per_night * max(1, state["days"] - 1)
            hotels_list.append({
                "name": h.name,
                "description": h.description,
                "rating": h.rating,
                "price_per_night": h.price_per_night,
                "estimated_total": total,
                "location": h.location
            })
            
        state["hotels"] = hotels_list
    except Exception as e:
        state["error"] = f"Hotel Agent failed: {str(e)}"
        
    return state

@trace_graph_node("Attractions Agent")
def attractions_agent(state: PlanState) -> PlanState:
    """Attractions Agent: Researches and builds daily activity itineraries using RAG context."""
    if state.get("error"):
        return state
        
    try:
        skeleton = state["planner_skeleton"]
        skeleton_str = "\n".join([f"Day {i+1}: {t} (Area: {a})" for i, (t, a) in enumerate(zip(skeleton["themes"], skeleton["areas"]))])
        
        curr = state.get("currency", "USD")
        sym = state.get("currency_symbol", "$")
        
        context_str = ""
        if state.get("retrieved_context"):
            context_str = "\n".join([f"- {c}" for c in state["retrieved_context"]])
            context_prompt = f"\nUse the following verified local guide facts (RAG Context) to suggest sights, restaurants, and prices if relevant:\n{context_str}\n"
        else:
            context_prompt = ""
            
        prompt = (
            f"You are a local guide Attractions Agent.\n"
            f"Build a detailed activity itinerary for a {state['days']}-day trip to {state['destination']}.\n"
            f"The daily geographic themes are:\n{skeleton_str}\n\n"
            f"For each day, suggest:\n"
            f"- 2 to 3 tourist spots, activities, or sights. Include estimated costs and duration.\n"
            f"- 2 local restaurants (lunch, dinner) with estimated average cost per person.\n"
            f"- Helpful transit or route recommendations.\n"
            f"All activity costs and food averages MUST be in the local currency: {curr} ({sym}).\n"
            f"{context_prompt}\n"
            f"Tailor the recommendations to the daily geographic focus areas and the general budget: {sym}{state['budget']} {curr}."
        )
        
        response = invoke_with_fallback(state["provider"], state["api_key"], AttractionsAgentOutput, prompt)
        
        daily_itinerary = []
        for plan in response.daily_plans:
            daily_itinerary.append(plan.model_dump())
            
        state["daily_itinerary"] = daily_itinerary
    except Exception as e:
        state["error"] = f"Attractions Agent failed: {str(e)}"
        
    return state

@trace_graph_node("Budget Agent")
def budget_agent(state: PlanState) -> PlanState:
    """Budget Agent: Synthesizes expenses, chooses the best hotel fitting the budget, and adjusts costs in the local currency."""
    if state.get("error"):
        return state
        
    try:
        hotels = state["hotels"]
        itinerary = state["daily_itinerary"]
        
        curr = state.get("currency", "USD")
        sym = state.get("currency_symbol", "$")
        
        hotels_str = "\n".join([f"- {h['name']} ({h['location']}): {sym}{h['price_per_night']}/night (Total: {sym}{h['estimated_total']})" for h in hotels])
        
        activities_cost = 0.0
        food_cost_estimate = 0.0
        for day in itinerary:
            for act in day.get("activities", []):
                activities_cost += act.get("cost", 0.0)
            for rest in day.get("restaurants", []):
                food_cost_estimate += rest.get("average_cost", 0.0)
                
        prompt = (
            f"You are an expert financial advisor and Budget Agent.\n"
            f"Evaluate the budget for a {state['days']}-day trip to {state['destination']} with a user budget of {sym}{state['budget']} {curr}.\n\n"
            f"All calculation results must be strictly in the local currency: {curr} ({sym}).\n\n"
            f"Available Hotel Options (for {state['days']-1} nights):\n{hotels_str}\n\n"
            f"Activity Costs (excluding hotels and meals): {sym}{activities_cost:.2f} {curr}\n"
            f"Estimated Meal Costs (from suggested restaurants): {sym}{food_cost_estimate:.2f} {curr}\n\n"
            f"Your Task:\n"
            f"1. Select the hotel that best fits the total budget (Budget, Mid-Range, or Luxury option).\n"
            f"2. Calculate total cost = Selected Hotel Total Cost + Activity Costs + Food Costs + Local Transport Costs (estimate local transport based on days and destinations).\n"
            f"3. If total cost exceeds the user's budget ({sym}{state['budget']}), explain what swaps or recommendations you would suggest (e.g. choosing the Budget hotel option instead, suggesting free walking tours, or eating street food).\n"
            f"4. Determine status: 'within_budget' if total_cost <= budget, otherwise 'over_budget'. If over budget, make reasonable adjustments to total costs to represent a realistic, optimized budget suggestion."
        )
        
        response = invoke_with_fallback(state["provider"], state["api_key"], BudgetAgentOutput, prompt)
        
        state["budget_breakdown"] = {
            "hotel_costs": response.hotel_costs,
            "activity_costs": response.activity_costs,
            "food_costs": response.food_costs,
            "transport_costs": response.transport_costs,
            "total_cost": response.total_cost,
            "status": response.status,
            "suggestions": response.suggestions,
            "selected_hotel_name": response.selected_hotel_name
        }
        
    except Exception as e:
        state["error"] = f"Budget Agent failed: {str(e)}"
        
    return state
