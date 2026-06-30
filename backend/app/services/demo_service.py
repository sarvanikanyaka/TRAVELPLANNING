import asyncio
import json
from typing import Dict, Any, List
from app.services.rag_service import detect_currency
from app.observability import logger

# Specialized mock templates for popular destinations to make the demo look extremely authentic

DESTINATION_TEMPLATES = {
    "tokyo": {
        "themes": ["Tech & Modern Culture", "Historical Temples & Gardens", "Shopping & Culinary Delights", "Panoramic Views & Nightlife", "Traditional Crafts & Arts"],
        "areas": ["Akihabara & Shibuya", "Asakusa & Ueno", "Ginza & Tsukiji", "Shinjuku & Roppongi", "Harajuku & Omotesando"],
        "rationale": "A balanced journey mixing Tokyo's ultra-modern tech subculture with its serene historical neighborhoods.",
        "hotels": [
            {"name": "Capsule & Sauna Century", "description": "Classic futuristic pod hotel, highly compact and budget-friendly.", "rating": "3.5 stars", "price_per_night": 4500, "location": "Shinjuku"},
            {"name": "Hotel Sunroute Plaza", "description": "Comfortable mid-range rooms with great metro access and city views.", "rating": "4.0 stars", "price_per_night": 15000, "location": "Shibuya"},
            {"name": "Park Hyatt Tokyo", "description": "Luxury high-rise hotel featuring panoramic views and world-class service.", "rating": "5.0 stars", "price_per_night": 90000, "location": "Shinjuku"}
        ],
        "activities": [
            {"name": "Shibuya Crossing & Hachiko", "description": "Walk the world's busiest pedestrian crossing.", "category": "Sightseeing", "cost": 0, "duration": "1 hour", "recommended_time": "Morning"},
            {"name": "Senso-ji Temple", "description": "Tokyo's oldest and most iconic Buddhist temple.", "category": "Historic", "cost": 0, "duration": "2 hours", "recommended_time": "Morning"},
            {"name": "Akihabara Electric Town", "description": "Explore massive anime, gaming, and electronic stores.", "category": "Shopping", "cost": 0, "duration": "3 hours", "recommended_time": "Afternoon"},
            {"name": "TeamLab Planets", "description": "Immersive digital art museum with sensory water installations.", "category": "Museum", "cost": 3800, "duration": "2.5 hours", "recommended_time": "Afternoon"},
            {"name": "Meiji Jingu Shrine", "description": "Serene shrine nestled in a dense, quiet forest.", "category": "Nature", "cost": 0, "duration": "1.5 hours", "recommended_time": "Morning"}
        ],
        "restaurants": [
            {"name": "Ichiran Ramen", "description": "Famous tonkotsu ramen served in individual dining booths.", "cuisine": "Japanese Ramen", "average_cost": 1200, "location": "Shibuya"},
            {"name": "Tsukiji Kagura Sushi", "description": "Ultra-fresh sushi made right in the historic outer fish market.", "cuisine": "Sushi", "average_cost": 4000, "location": "Tsukiji"},
            {"name": "Rokurinsha", "description": "Famous for rich tsukemen (dipping noodles) in Tokyo Station.", "cuisine": "Noodles", "average_cost": 1500, "location": "Marunouchi"},
            {"name": "Robot Restaurant Izakaya", "description": "Fun, high-energy dining experience with themed visual performances.", "cuisine": "Izakaya Pub", "average_cost": 6000, "location": "Shinjuku"}
        ]
    },
    "paris": {
        "themes": ["Iconic Landmarks", "Art & Renaissance History", "Bohemian Streets & Cafes", "Palatial Gardens & River Cruising", "High Fashion & Gastronomy"],
        "areas": ["Eiffel Tower & Seine", "Louvre & Tuileries", "Montmartre & Sacre-Coeur", "Latin Quarter & Marais", "Champs-Elysees"],
        "rationale": "Immerse in classic Parisian history, showcasing world-famous museums and scenic river strolls.",
        "hotels": [
            {"name": "Generator Paris", "description": "Trendy boutique hostel with a rooftop terrace overlooking Sacre-Coeur.", "rating": "3.5 stars", "price_per_night": 55, "location": "10th Arr."},
            {"name": "Hotel Caron de Beaumarchais", "description": "18th-century themed decor in the heart of the historic Marais.", "rating": "4.0 stars", "price_per_night": 190, "location": "Le Marais"},
            {"name": "The Ritz Paris", "description": "Legendary ultra-luxury palace featuring legendary suites and bars.", "rating": "5.0 stars", "price_per_night": 1100, "location": "Place Vendome"}
        ],
        "activities": [
            {"name": "Eiffel Tower Ascent", "description": "Climb to the summit for breathtaking panoramic views of Paris.", "category": "Sightseeing", "cost": 28, "duration": "2.5 hours", "recommended_time": "Morning"},
            {"name": "Louvre Museum Tour", "description": "See the Mona Lisa, Venus de Milo, and thousands of masterpieces.", "category": "Museum", "cost": 22, "duration": "4 hours", "recommended_time": "Morning"},
            {"name": "Sacre-Coeur & Montmartre", "description": "Walk the cobblestone paths of historic artists and see the basilica.", "category": "Historic", "cost": 0, "duration": "2 hours", "recommended_time": "Afternoon"},
            {"name": "Seine River Dinner Cruise", "description": "Glide past illuminated monuments while enjoying french cuisine.", "category": "Entertainment", "cost": 85, "duration": "2 hours", "recommended_time": "Evening"},
            {"name": "Jardin du Luxembourg", "description": "Stately gardens perfect for reading or sailing toy boats.", "category": "Nature", "cost": 0, "duration": "1.5 hours", "recommended_time": "Afternoon"}
        ],
        "restaurants": [
            {"name": "Le Comptoir du Relais", "description": "Acclaimed classic bistro serving gourmet French comfort dishes.", "cuisine": "French Bistro", "average_cost": 45, "location": "Saint-Germain"},
            {"name": "Pink Mamma", "description": "Spectacular multi-story Italian trattoria famous for fresh truffle pasta.", "cuisine": "Italian", "average_cost": 30, "location": "Pigalle"},
            {"name": "L'As du Fallafel", "description": "Legendary, busy spot serving the best warm pita falafels in Europe.", "cuisine": "Middle Eastern", "average_cost": 12, "location": "Le Marais"},
            {"name": "Le Jules Verne", "description": "Michelin-starred fine dining located directly inside the Eiffel Tower.", "cuisine": "Modern French", "average_cost": 250, "location": "Eiffel Tower"}
        ]
    },
    "india": {
        "themes": ["Royal Heritage & Forts", "Spiritual Temples & bazaars", "Mughal Architecture Wonders", "Lakes & Palace Vistas", "Culinary Safaris & Spices"],
        "areas": ["Old Delhi & Red Fort", "Taj Mahal & Agra Fort", "Jaipur Pink City", "Udaipur Lake Palace", "New Delhi Heritage"],
        "rationale": "A classic Golden Triangle tour exploring India's monumental forts, palaces, and street food hubs.",
        "hotels": [
            {"name": "Zostel Hostel Jaipur", "description": "Vibrant backpacking hostel with great social hubs and city tours.", "rating": "3.5 stars", "price_per_night": 800, "location": "Jaipur City Centre"},
            {"name": "Lemon Tree Premier", "description": "Modern business hotel with premium amenities and rooftop pool.", "rating": "4.2 stars", "price_per_night": 4500, "location": "Delhi Aerocity"},
            {"name": "The Taj Mahal Palace", "description": "Iconic luxury palace hotel offering sea views and legendary hospitality.", "rating": "5.0 stars", "price_per_night": 28000, "location": "Colaba, Mumbai"}
        ],
        "activities": [
            {"name": "The Taj Mahal Agra", "description": "Witness the world's most beautiful monument of love at sunrise.", "category": "Historic", "cost": 1300, "duration": "3 hours", "recommended_time": "Morning"},
            {"name": "Amber Fort Elephant & Jeep Tour", "description": "Grand hilltop fortress built from yellow and pink sandstone.", "category": "Historic", "cost": 500, "duration": "3 hours", "recommended_time": "Morning"},
            {"name": "Chandni Chowk Rickshaw Ride", "description": "Thrilling ride through Delhi's oldest and busiest spice markets.", "category": "Shopping", "cost": 300, "duration": "2 hours", "recommended_time": "Afternoon"},
            {"name": "Qutub Minar Complex", "description": "Victory tower and ancient ruins from the 12th century.", "category": "Historic", "cost": 600, "duration": "1.5 hours", "recommended_time": "Afternoon"},
            {"name": "Lake Pichola Boat Ride", "description": "Scenic boat cruise around Udaipur's floating palaces.", "category": "Nature", "cost": 400, "duration": "1 hour", "recommended_time": "Evening"}
        ],
        "restaurants": [
            {"name": "Karim's Old Delhi", "description": "Historic Mughlai diner serving famous seekh kebabs and mutton korma.", "cuisine": "Mughlai / Indian", "average_cost": 600, "location": "Chandni Chowk"},
            {"name": "Bukhara", "description": "Award-winning restaurant famous for dal bukhara cooked for 18 hours.", "cuisine": "North Indian Tandoor", "average_cost": 4500, "location": "Chanakyapuri"},
            {"name": "Chokhi Dhani", "description": "Ethnic village resort serving traditional Rajasthani thali dinners.", "cuisine": "Rajasthani Thali", "average_cost": 900, "location": "Jaipur Outskirts"},
            {"name": "Indian Accent", "description": "Modern Indian fine dining highlighting creative culinary twists.", "cuisine": "Modern Indian Fusion", "average_cost": 3500, "location": "Lodhi Road"}
        ]
    }
}

# Add default templates for generic destinations to keep it working for anything
DEFAULT_TEMPLATE = {
    "themes": ["Local Culture & Heritage", "Scenic Highlights & Parks", "Shopping & Local Cuisine", "Hidden Gems & Nightlife", "Relaxation & Souvenirs"],
    "areas": ["Historic Core", "Downtown Plaza", "Arts & Waterfront District", "High Street", "Garden Suburb"],
    "rationale": "An optimized journey through the heart of the city designed to discover local secrets, arts, and culinary hubs.",
    "hotels": [
        {"name": "Urban Nest Hostel", "description": "Affordable dorms and private rooms with active communal vibes.", "rating": "3.5 stars", "price_per_night": 35, "location": "Arts District"},
        {"name": "Plaza Central Hotel", "description": "Comfortable, centrally located rooms featuring excellent city access.", "rating": "4.2 stars", "price_per_night": 120, "location": "Downtown Plaza"},
        {"name": "Grand Palace & Spa", "description": "Luxury lodging with complete spa facilities and gourmet dining.", "rating": "5.0 stars", "price_per_night": 450, "location": "Historic Core"}
    ],
    "activities": [
        {"name": "Historic Walking Tour", "description": "Explore old architecture and learn the city's origins.", "category": "Historic", "cost": 15, "duration": "2.5 hours", "recommended_time": "Morning"},
        {"name": "Central Park & Botanic Garden", "description": "Beautiful trails, local flora, and relaxing greenhouse walks.", "category": "Nature", "cost": 0, "duration": "2 hours", "recommended_time": "Morning"},
        {"name": "Waterfront Harbor Cruise", "description": "Stunning vistas of the city skyline from the bay.", "category": "Sightseeing", "cost": 30, "duration": "1.5 hours", "recommended_time": "Afternoon"},
        {"name": "Local Craft Market", "description": "Shop for handmade souvenirs, vintage finds, and artisan goods.", "category": "Shopping", "cost": 0, "duration": "2 hours", "recommended_time": "Afternoon"},
        {"name": "Museum of Contemporary Art", "description": "Expansive modern gallery focusing on local and global artists.", "category": "Museum", "cost": 10, "duration": "2 hours", "recommended_time": "Morning"}
    ],
    "restaurants": [
        {"name": "The Corner Bistro", "description": "Cozy neighborhood spot serving local comfort food classics.", "cuisine": "Local Comfort Food", "average_cost": 20, "location": "Historic Core"},
        {"name": "Skyline Grill", "description": "Rooftop restaurant serving modern cuisine and cocktails.", "cuisine": "Modern Fusion", "average_cost": 55, "location": "Downtown Plaza"},
        {"name": "Green Street Cafe", "description": "Fresh, locally-sourced healthy options and artisan coffees.", "cuisine": "Healthy Cafe", "average_cost": 15, "location": "Arts District"},
        {"name": "Chef's Table Experience", "description": "Fine dining menu showcasing seasonal ingredients and pairings.", "cuisine": "Fine Dining", "average_cost": 120, "location": "Historic Core"}
    ]
}

def get_destination_template(destination: str) -> Dict[str, Any]:
    """Helper to match destination query to our templates."""
    dest_lower = destination.lower()
    for key, template in DESTINATION_TEMPLATES.items():
        if key in dest_lower:
            return template
    return DEFAULT_TEMPLATE

async def generate_demo_stream(destination: str, budget: float, days: int):
    """
    Streams a mock LangGraph execution step-by-step to simulate
    agent planning without needing live API keys.
    """
    logger.info(f"Starting DEMO MODE generator for {destination}")
    
    currency, symbol = detect_currency(destination)
    template = get_destination_template(destination)
    
    # Scale generic template prices to match the currency rate
    rate = 1.0
    if currency == "INR":
        rate = 80.0
    elif currency == "JPY":
        rate = 150.0
    elif currency == "EUR":
        rate = 0.9
    elif currency == "GBP":
        rate = 0.8
        
    # --- 1. RETRIEVAL AGENT ---
    yield {
        "event": "agent_update",
        "data": json.dumps({
            "agent": "Retrieval Agent",
            "state": {
                "retrieved_context": [
                    f"Welcome to {destination}! The local currency is {currency} ({symbol}).",
                    f"Travel tip: The best neighborhoods for tourism are {', '.join(template['areas'][:3])}.",
                    f"RAG facts suggest keeping dining expectations balanced between casual street vendors and sit-down spots."
                ],
                "currency": currency,
                "currency_symbol": symbol
            }
        })
    }
    await asyncio.sleep(1.5)
    
    # --- 2. PLANNER AGENT ---
    themes = []
    areas = []
    for d in range(days):
        themes.append(template["themes"][d % len(template["themes"])])
        areas.append(template["areas"][d % len(template["areas"])])
        
    planner_skeleton = {
        "themes": themes,
        "areas": areas,
        "rationale": template["rationale"]
    }
    
    yield {
        "event": "agent_update",
        "data": json.dumps({
            "agent": "Planner Agent",
            "state": {
                "planner_skeleton": planner_skeleton
            }
        })
    }
    await asyncio.sleep(2.0)
    
    # --- 3. HOTEL AGENT ---
    hotels_list = []
    for h in template["hotels"]:
        # Adjust base hotel cost by exchange rate
        price = h["price_per_night"]
        if template == DEFAULT_TEMPLATE:
            price = round(price * rate)
            
        total = price * max(1, days - 1)
        hotels_list.append({
            "name": f"{destination} " + h["name"] if template == DEFAULT_TEMPLATE else h["name"],
            "description": h["description"],
            "rating": h["rating"],
            "price_per_night": price,
            "estimated_total": total,
            "location": h["location"]
        })
        
    yield {
        "event": "agent_update",
        "data": json.dumps({
            "agent": "Hotel Agent",
            "state": {
                "hotels": hotels_list
            }
        })
    }
    await asyncio.sleep(2.0)
    
    # --- 4. ATTRACTIONS AGENT ---
    daily_plans = []
    for d in range(days):
        day_theme = themes[d]
        day_area = areas[d]
        
        # Pull 2 activities
        act1 = template["activities"][(d * 2) % len(template["activities"])]
        act2 = template["activities"][(d * 2 + 1) % len(template["activities"])]
        
        acts = []
        for a in [act1, act2]:
            cost = a["cost"]
            if template == DEFAULT_TEMPLATE:
                cost = round(cost * rate)
            acts.append({
                "name": a["name"],
                "description": a["description"],
                "category": a["category"],
                "cost": cost,
                "duration": a["duration"],
                "recommended_time": a["recommended_time"]
            })
            
        # Pull 2 restaurants (lunch, dinner)
        rest1 = template["restaurants"][(d * 2) % len(template["restaurants"])]
        rest2 = template["restaurants"][(d * 2 + 1) % len(template["restaurants"])]
        
        rests = []
        for r in [rest1, rest2]:
            cost = r["average_cost"]
            if template == DEFAULT_TEMPLATE:
                cost = round(cost * rate)
            rests.append({
                "name": r["name"],
                "description": r["description"],
                "cuisine": r["cuisine"],
                "average_cost": cost,
                "location": r["location"]
            })
            
        daily_plans.append({
            "day_number": d + 1,
            "theme": day_theme,
            "activities": acts,
            "restaurants": rests,
            "routing_notes": f"Best explored by walking and local transit in the {day_area} district."
        })
        
    yield {
        "event": "agent_update",
        "data": json.dumps({
            "agent": "Attractions Agent",
            "state": {
                "daily_itinerary": daily_plans
            }
        })
    }
    await asyncio.sleep(2.0)
    
    # --- 5. BUDGET AGENT ---
    # Sum up expenses
    act_total = sum(sum(act["cost"] for act in day["activities"]) for day in daily_plans)
    food_total = sum(sum(rest["average_cost"] for rest in day["restaurants"]) for day in daily_plans)
    transport_total = round(10 * rate * days)
    
    # Pick a hotel that fits within the budget if possible, otherwise fallback to budget hotel
    selected_hotel = hotels_list[0] # default budget
    for hotel in reversed(hotels_list): # Check Luxury, then Mid, then Budget
        potential_total = hotel["estimated_total"] + act_total + food_total + transport_total
        if potential_total <= budget:
            selected_hotel = hotel
            break
            
    final_hotel_costs = selected_hotel["estimated_total"]
    final_total = final_hotel_costs + act_total + food_total + transport_total
    
    status = "within_budget" if final_total <= budget else "over_budget"
    
    if status == "within_budget":
        suggestions = f"The trip is within budget using {selected_hotel['name']}. You have optimal spending room."
    else:
        suggestions = f"We selected the economical hotel option ({selected_hotel['name']}) and limited transport expenses to keep the trip as close to the target budget of {symbol}{budget} as possible."
        
    budget_breakdown = {
        "hotel_costs": final_hotel_costs,
        "activity_costs": act_total,
        "food_costs": food_total,
        "transport_costs": transport_total,
        "total_cost": final_total,
        "status": status,
        "suggestions": suggestions,
        "selected_hotel_name": selected_hotel["name"]
    }
    
    yield {
        "event": "agent_update",
        "data": json.dumps({
            "agent": "Budget Agent",
            "state": {
                "budget_breakdown": budget_breakdown
            }
        })
    }
    await asyncio.sleep(1.0)
    
    # Done!
    yield {
        "event": "done",
        "data": json.dumps({"message": "Travel plan generated successfully!"})
    }
