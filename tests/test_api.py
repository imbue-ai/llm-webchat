import sqlite_utils
from starlette.testclient import TestClient

from tests.helpers import insert_conversations
from tests.helpers import insert_responses


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


def test_list_responses(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "resp1",
                "model": "gpt-4",
                "prompt": "Hello",
                "system": None,
                "response": "Hi there!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": 5,
                "output_tokens": 10,
            },
        ],
    )

    response = client.get("/api/conversations/conv1/responses")
    assert response.status_code == 200
    data = response.json()
    assert "responses" in data
    assert len(data["responses"]) == 1
    assert data["responses"][0]["id"] == "resp1"
    assert data["responses"][0]["prompt"] == "Hello"
    assert data["responses"][0]["response"] == "Hi there!"
    assert data["responses"][0]["model"] == "gpt-4"
    assert data["responses"][0]["conversation_id"] == "conv1"


def test_list_responses_empty_conversation(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])

    response = client.get("/api/conversations/conv1/responses")
    assert response.status_code == 200
    data = response.json()
    assert data["responses"] == []


def test_list_responses_with_null_prompt(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "resp1",
                "model": "gpt-4",
                "prompt": None,
                "system": None,
                "response": "Injected",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": None,
                "input_tokens": None,
                "output_tokens": None,
            },
        ],
    )

    response = client.get("/api/conversations/conv1/responses")
    assert response.status_code == 200
    data = response.json()
    assert len(data["responses"]) == 1
    assert data["responses"][0]["prompt"] is None
    assert data["responses"][0]["response"] == "Injected"
