# this file verifies the first backend boundary in the project architecture.
# it checks that the local service is available to the browser integration.
# it also protects the supported demo chord vocabulary until models are added.
from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_health_reports_local_service() -> None:
    # the health response confirms that local inference is available
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "fretfly",
        "mode": "local",
    }


def test_demo_chord_uses_supported_vocabulary() -> None:
    # the demo endpoint must stay inside the initial chord vocabulary
    response = client.get("/api/demo-chord")

    assert response.status_code == 200
    assert response.json()["chord"] in {"C", "G", "Am", "F"}
