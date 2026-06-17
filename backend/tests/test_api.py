import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    """Verify that the health check endpoint is active and returns healthy."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "AI Travel Planner"}

def test_validation_missing_params():
    """Verify that omitting required parameters yields a 422 validation error."""
    response = client.get("/api/plan/stream")
    assert response.status_code == 422

def test_validation_invalid_budget():
    """Verify that a negative budget is rejected with a 422 validation error."""
    response = client.get("/api/plan/stream?destination=Tokyo&budget=-10&days=3")
    assert response.status_code == 422
    data = response.json()
    assert "errors" in data["detail"]
    assert any("budget" in err["field"] for err in data["detail"]["errors"])

def test_validation_invalid_days():
    """Verify that invalid day count (e.g. > 14 or < 1) is rejected."""
    response = client.get("/api/plan/stream?destination=Tokyo&budget=1000&days=20")
    assert response.status_code == 422
    data = response.json()
    assert "errors" in data["detail"]
    assert any("days" in err["field"] for err in data["detail"]["errors"])

def test_validation_empty_destination():
    """Verify that an empty destination is rejected."""
    response = client.get("/api/plan/stream?destination=&budget=1000&days=3")
    assert response.status_code == 422
    data = response.json()
    assert "errors" in data["detail"]
    assert any("destination" in err["field"] for err in data["detail"]["errors"])
