from unittest.mock import patch, MagicMock
from app.graph.state import PlanState
from app.graph.nodes import retrieval_agent, planner_agent, hotel_agent, attractions_agent, budget_agent

class MockHotel:
    def __init__(self, name, description, rating, price_per_night, location):
        self.name = name
        self.description = description
        self.rating = rating
        self.price_per_night = price_per_night
        self.location = location

def test_retrieval_agent_success():
    """Verify that the Retrieval Agent extracts context and sets correct currency configuration."""
    state: PlanState = {
        "destination": "Goa, India",
        "budget": 40000.0,
        "days": 4,
        "provider": "openai",
        "api_key": "test_key",
        "retrieved_context": None,
        "currency": None,
        "currency_symbol": None,
        "planner_skeleton": None,
        "hotels": None,
        "attractions": None,
        "restaurants": None,
        "daily_itinerary": None,
        "budget_breakdown": None,
        "error": None
    }

    dummy_context = ["Zostel is 800 INR per night.", "Gateway of India is free."]

    with patch("app.graph.nodes.rag_service.retrieve_context", return_value=dummy_context) as mock_retrieve:
        res_state = retrieval_agent(state)
        assert res_state["error"] is None
        # Should map to INR and ₹ for India destination
        assert res_state["currency"] == "INR"
        assert res_state["currency_symbol"] == "₹"
        assert res_state["retrieved_context"] == dummy_context
        mock_retrieve.assert_called_once()

def test_planner_agent_success():
    """Verify that the Planner Agent invokes the LLM and updates the planner_skeleton in the state."""
    state: PlanState = {
        "destination": "Paris",
        "budget": 2000.0,
        "days": 2,
        "provider": "openai",
        "api_key": "test_key",
        "retrieved_context": [],
        "currency": "USD",
        "currency_symbol": "$",
        "planner_skeleton": None,
        "hotels": None,
        "attractions": None,
        "restaurants": None,
        "daily_itinerary": None,
        "budget_breakdown": None,
        "error": None
    }

    mock_llm_output = MagicMock()
    mock_llm_output.model_dump.return_value = {
        "themes": ["Eiffel Tower & Museums", "Seine River & Cafes"],
        "areas": ["7th Arrondissement", "Marais"],
        "rationale": "Compact schedule focusing on iconic Paris landmarks."
    }

    with patch("app.graph.nodes.get_llm") as mock_get_llm:
        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value = mock_llm
        mock_llm.invoke.return_value = mock_llm_output
        mock_get_llm.return_value = mock_llm

        res_state = planner_agent(state)
        assert res_state["error"] is None
        assert res_state["planner_skeleton"] is not None
        assert res_state["planner_skeleton"]["themes"] == ["Eiffel Tower & Museums", "Seine River & Cafes"]

def test_hotel_agent_success():
    """Verify that the Hotel Agent returns three hotel suggestions based on inputs and context."""
    state: PlanState = {
        "destination": "Paris",
        "budget": 2000.0,
        "days": 3,
        "provider": "openai",
        "api_key": "test_key",
        "retrieved_context": ["Some Parisian lodging info"],
        "currency": "EUR",
        "currency_symbol": "€",
        "planner_skeleton": {"themes": ["T1", "T2", "T3"], "areas": ["A1", "A2", "A3"], "rationale": "Ok"},
        "hotels": None,
        "attractions": None,
        "restaurants": None,
        "daily_itinerary": None,
        "budget_breakdown": None,
        "error": None
    }

    mock_hotel_1 = MockHotel("Budget Hotel", "Cheap stay", "3 stars", 80.0, "Marais")
    mock_hotel_2 = MockHotel("Mid Hotel", "Cozy stay", "4 stars", 150.0, "Opera")
    mock_hotel_3 = MockHotel("Lux Hotel", "Luxury stay", "5 stars", 400.0, "Champs-Elysees")

    mock_response = MagicMock()
    mock_response.hotels = [mock_hotel_1, mock_hotel_2, mock_hotel_3]

    with patch("app.graph.nodes.get_llm") as mock_get_llm:
        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value = mock_llm
        mock_llm.invoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        res_state = hotel_agent(state)
        assert res_state["error"] is None
        assert res_state["hotels"] is not None
        assert len(res_state["hotels"]) == 3
        # price_per_night * (days-1) = 150.0 * 2 = 300.0
        assert res_state["hotels"][1]["estimated_total"] == 300.0

def test_agent_error_handling():
    """Verify that if an agent throws an exception, the error state is set rather than crashing the system."""
    state: PlanState = {
        "destination": "Paris",
        "budget": 2000.0,
        "days": 2,
        "provider": "openai",
        "api_key": "test_key",
        "retrieved_context": [],
        "currency": "USD",
        "currency_symbol": "$",
        "planner_skeleton": None,
        "hotels": None,
        "attractions": None,
        "restaurants": None,
        "daily_itinerary": None,
        "budget_breakdown": None,
        "error": None
    }

    with patch("app.graph.nodes.get_llm", side_effect=Exception("API limit exceeded")):
        res_state = planner_agent(state)
        assert res_state["error"] is not None
        assert "API limit exceeded" in res_state["error"]
