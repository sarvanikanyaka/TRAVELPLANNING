import json
from typing import Optional
from fastapi import FastAPI, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import ValidationError

from app.config import settings
from app.models import PlannerRequest, TravelPlan
from app.graph.workflow import app_graph
from app.observability import CorrelationIdMiddleware, configure_langsmith, logger
from app.services.demo_service import generate_demo_stream

# Initialize application
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Multi-agent AI Travel Planner utilizing LangGraph, FastAPI, and React.",
    version="1.0.0"
)

# Setup CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add structured request correlation ID middleware
app.add_middleware(CorrelationIdMiddleware)

# Initialize LangSmith tracing on startup
@app.on_event("startup")
async def startup_event():
    configure_langsmith()

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": settings.PROJECT_NAME}

@app.get("/api/plan/stream")
async def stream_itinerary(
    destination: str = Query(..., description="Destination location"),
    budget: float = Query(..., description="Overall budget in USD"),
    days: int = Query(..., description="Number of days"),
    provider: str = Query("openai", description="Model provider: openai or gemini"),
    api_key: Optional[str] = Query(None, description="Optional custom API key")
):
    """
    Streams the LangGraph travel planning execution step-by-step
    using Server-Sent Events (SSE).
    """
    # 1. Perform Pydantic validation on the query params
    try:
        request_data = PlannerRequest(
            destination=destination,
            budget=budget,
            days=days,
            provider=provider,
            api_key=api_key
        )
    except ValidationError as e:
        # Format validation errors clearly
        errors = [{"field": err["loc"][0], "message": err["msg"]} for err in e.errors()]
        logger.warning(f"Validation failed for request: {errors}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"errors": errors}
        )

    # 2. Define the generator to stream graph execution
    async def event_generator():
        inputs = {
            "destination": request_data.destination,
            "budget": request_data.budget,
            "days": request_data.days,
            "provider": request_data.provider,
            "api_key": request_data.api_key,
            "error": None,
            "retrieved_context": None,
            "currency": None,
            "currency_symbol": None,
            "planner_skeleton": None,
            "hotels": None,
            "attractions": None,
            "restaurants": None,
            "daily_itinerary": None,
            "budget_breakdown": None
        }

        # Check if API keys are completely missing
        has_server_keys = bool(settings.OPENAI_API_KEY or settings.GOOGLE_API_KEY)
        has_custom_key = bool(request_data.api_key)
        
        if not (has_server_keys or has_custom_key):
            logger.info("No API keys provided in environment or request. Launching Demo Mode...")
            async for event in generate_demo_stream(request_data.destination, request_data.budget, request_data.days):
                yield event
            return

        logger.info(f"Starting LangGraph execution for destination: {request_data.destination}")

        try:
            async for chunk in app_graph.astream(inputs, stream_mode="updates"):
                if not chunk:
                    continue
                
                # Extract the node name and output state
                node_name, state = list(chunk.items())[0]
                
                # If there's an error in state, notify client, log it, and switch to demo mode
                if state.get("error"):
                    logger.warning(f"LangGraph Agent Error in '{node_name}': {state['error']}. Switching to Demo Mode fallback...")
                    async for event in generate_demo_stream(request_data.destination, request_data.budget, request_data.days):
                        yield event
                    return

                # Send the node update back to client
                yield {
                    "event": "agent_update",
                    "data": json.dumps({
                        "agent": node_name,
                        "state": {
                            "retrieved_context": state.get("retrieved_context"),
                            "currency": state.get("currency"),
                            "currency_symbol": state.get("currency_symbol"),
                            "planner_skeleton": state.get("planner_skeleton"),
                            "hotels": state.get("hotels"),
                            "daily_itinerary": state.get("daily_itinerary"),
                            "budget_breakdown": state.get("budget_breakdown"),
                        }
                    })
                }
            
            # Send final completion event
            yield {
                "event": "done",
                "data": json.dumps({"message": "Travel plan generated successfully!"})
            }

        except Exception as e:
            logger.error(f"Error during graph execution: {str(e)}. Falling back to Demo Mode...", exc_info=True)
            async for event in generate_demo_stream(request_data.destination, request_data.budget, request_data.days):
                yield event

    return EventSourceResponse(event_generator())
