import sqlite_utils
from starlette.testclient import TestClient

from tests.helpers import insert_conversations


def test_index(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200


def test_list_conversations(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test conversation", "model": "gpt-4"}])

    response = client.get("/api/conversations")
    assert response.status_code == 200
    data = response.json()
    assert "conversations" in data
    assert len(data["conversations"]) == 1
    assert data["conversations"][0]["id"] == "conv1"
    assert data["conversations"][0]["name"] == "Test conversation"
    assert data["conversations"][0]["model"] == "gpt-4"


def test_list_conversations_with_count(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(
        test_database,
        [{"id": f"conv{i}", "name": f"Chat {i}", "model": "gpt-4"} for i in range(5)],
    )

    response = client.get("/api/conversations?count=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data["conversations"]) == 2
