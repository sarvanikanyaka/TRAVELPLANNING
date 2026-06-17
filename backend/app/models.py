from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator

class PlannerRequest(BaseModel):
    destination: str = Field(..., description="The travel destination (e.g. Tokyo, Japan)")
    budget: float = Field(..., description="Overall travel budget in USD")
    days: int = Field(..., description="Number of days for the itinerary")
    provider: str = Field("openai", description="LLM provider: 'openai' or 'gemini'")
    api_key: Optional[str] = Field(None, description="Optional custom API key to override backend env key")

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Destination cannot be empty")
        return clean

    @field_validator("budget")
    @classmethod
    def validate_budget(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Budget must be a positive number")
        return v

    @field_validator("days")
    @classmethod
    def validate_days(cls, v: int) -> int:
        if v < 1 or v > 14:
            raise ValueError("Days must be between 1 and 14")
        return v

class Hotel(BaseModel):
    name: str = Field(..., description="Name of the hotel")
    description: str = Field(..., description="Description of the lodging options/amenities")
    rating: str = Field(..., description="Hotel star rating or score")
    price_per_night: float = Field(..., description="Estimated cost per night in USD")
    estimated_total: float = Field(..., description="Estimated total cost for the stay in USD")
    location: str = Field(..., description="Neighborhood or area")

class Attraction(BaseModel):
    name: str = Field(..., description="Name of the attraction/activity")
    description: str = Field(..., description="Short explanation of what to do/see")
    category: str = Field(..., description="Type of attraction (e.g. Historic, Nature, Museum, Shopping)")
    cost: float = Field(..., description="Estimated cost per person in USD")
    duration: str = Field(..., description="Approximate time spent (e.g. 2 hours)")
    recommended_time: str = Field(..., description="Best time of day to visit (e.g. Morning, Afternoon)")

class Restaurant(BaseModel):
    name: str = Field(..., description="Name of the restaurant")
    description: str = Field(..., description="Brief summary of vibe or specialties")
    cuisine: str = Field(..., description="Cuisine type")
    average_cost: float = Field(..., description="Average cost per person in USD")
    location: str = Field(..., description="Where the restaurant is located")

class DayItinerary(BaseModel):
    day_number: int = Field(..., description="Day number")
    theme: str = Field(..., description="General theme of the day")
    activities: List[Attraction] = Field(default_factory=list, description="Activities planned for the day")
    restaurants: List[Restaurant] = Field(default_factory=list, description="Dining recommendations for the day")
    routing_notes: str = Field(..., description="Transit tips, geographical flow, or logistics")

class BudgetBreakdown(BaseModel):
    hotel_costs: float = Field(..., description="Sum of lodging costs")
    activity_costs: float = Field(..., description="Sum of all attraction costs")
    food_costs: float = Field(..., description="Estimated food and dining costs")
    transport_costs: float = Field(..., description="Estimated local transport/transit costs")
    total_cost: float = Field(..., description="Total estimated travel cost in USD")
    status: str = Field(..., description="Status relative to user budget ('within_budget' or 'over_budget')")
    suggestions: str = Field(..., description="Recommendations or adjustments made by the budget agent")

class TravelPlan(BaseModel):
    destination: str
    budget: float
    days: int
    hotels: List[Hotel]
    daily_itinerary: List[DayItinerary]
    budget_breakdown: BudgetBreakdown
