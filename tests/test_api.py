import queue
import subprocess
from unittest.mock import MagicMock
from unittest.mock import patch

import sqlite_utils
from fastapi import FastAPI
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


def test_list_responses_nonexistent_conversation(client: TestClient, test_database: sqlite_utils.Database) -> None:
    response = client.get("/api/conversations/nonexistent/responses")
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "nonexistent" in data["detail"]


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


def _make_fake_popen(stdout_chunks: list[bytes], returncode: int = 0, stderr: bytes = b"") -> MagicMock:
    mock_process = MagicMock()
    mock_process.returncode = returncode
    mock_process.wait = MagicMock()

    read_calls = [*stdout_chunks, b""]

    def fake_read(size: int) -> bytes:
        if read_calls:
            return read_calls.pop(0)
        return b""

    mock_process.stdout = MagicMock()
    mock_process.stdout.read = fake_read
    mock_process.stderr = MagicMock()
    mock_process.stderr.read = MagicMock(return_value=stderr)
    return mock_process


def test_create_conversation(client: TestClient, application: FastAPI) -> None:
    response = client.post("/api/conversations", json={"name": "Hello there"})
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert isinstance(data["id"], str)
    assert len(data["id"]) > 0

    database = application.state.database
    rows = database.execute("SELECT id, name, model FROM conversations WHERE id = ?", [data["id"]]).fetchall()
    assert len(rows) == 1
    assert rows[0]["id"] == data["id"]
    assert rows[0]["name"] == "Hello there"
    assert rows[0]["model"] == "anthropic/claude-opus-4-6"


def test_create_conversation_stores_name_as_given(client: TestClient, application: FastAPI) -> None:
    response = client.post("/api/conversations", json={"name": "My custom name"})
    assert response.status_code == 201

    database = application.state.database
    data = response.json()
    rows = database.execute("SELECT name FROM conversations WHERE id = ?", [data["id"]]).fetchall()
    assert rows[0]["name"] == "My custom name"


def test_create_conversation_returns_unique_ids(client: TestClient) -> None:
    response_one = client.post("/api/conversations", json={"name": "First"})
    response_two = client.post("/api/conversations", json={"name": "Second"})
    assert response_one.json()["id"] != response_two.json()["id"]


def test_send_message_nonexistent_conversation(client: TestClient, test_database: sqlite_utils.Database) -> None:
    response = client.post(
        "/api/conversations/nonexistent/message",
        json={"message": "Hello"},
    )
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "nonexistent" in data["detail"]


def test_stream_events_nonexistent_conversation(client: TestClient, test_database: sqlite_utils.Database) -> None:
    response = client.get("/api/conversations/nonexistent/stream")
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "nonexistent" in data["detail"]


def test_send_message_returns_ok(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])

    with patch("llm_webchat.server.subprocess.Popen") as mock_popen:
        mock_popen.return_value = _make_fake_popen([b"Hello!"])

        response = client.post(
            "/api/conversations/conv1/message",
            json={"message": "Hi there"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def _drain_queue(event_queue: queue.Queue[dict[str, str] | None]) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []
    while not event_queue.empty():
        event = event_queue.get_nowait()
        if event is not None:
            events.append(event)
    return events


def test_run_llm_subprocess_broadcasts_events() -> None:
    from llm_webchat.event_queues import ConversationEventQueues
    from llm_webchat.server import _run_llm_subprocess

    conversation_event_queues = ConversationEventQueues()
    conversation_id = "test_broadcast_conv"
    queue = conversation_event_queues.register(conversation_id)

    mock_process = _make_fake_popen([b"Hello ", b"world!"])

    with patch("llm_webchat.server.subprocess.Popen", return_value=mock_process):
        _run_llm_subprocess(conversation_event_queues, conversation_id, "Hi")

    events = _drain_queue(queue)

    event_types = [event["type"] for event in events]
    assert event_types[0] == "user_message"
    assert event_types[1] == "message_start"
    assert "message_delta" in event_types
    assert event_types[-1] == "message_end"

    user_events = [event for event in events if event["type"] == "user_message"]
    assert user_events[0]["content"] == "Hi"

    delta_events = [event for event in events if event["type"] == "message_delta"]
    combined_content = "".join(event["content"] for event in delta_events)
    assert combined_content == "Hello world!"


def test_run_llm_subprocess_broadcasts_error_on_failure() -> None:
    from llm_webchat.event_queues import ConversationEventQueues
    from llm_webchat.server import _run_llm_subprocess

    conversation_event_queues = ConversationEventQueues()
    conversation_id = "test_error_conv"
    queue = conversation_event_queues.register(conversation_id)

    mock_process = _make_fake_popen([], returncode=1, stderr=b"Something went wrong")

    with patch("llm_webchat.server.subprocess.Popen", return_value=mock_process):
        _run_llm_subprocess(conversation_event_queues, conversation_id, "Hi")

    events = _drain_queue(queue)

    event_types = [event["type"] for event in events]
    assert "error" in event_types
    assert event_types[-1] == "message_end"

    error_events = [event for event in events if event["type"] == "error"]
    assert len(error_events) == 1
    assert "Something went wrong" in error_events[0]["content"]


def test_run_llm_subprocess_calls_llm_with_correct_arguments() -> None:
    from llm_webchat.event_queues import ConversationEventQueues
    from llm_webchat.server import _run_llm_subprocess

    conversation_event_queues = ConversationEventQueues()
    conversation_id = "test_args_conv"
    conversation_event_queues.register(conversation_id)

    mock_process = _make_fake_popen([b"response"])

    with patch("llm_webchat.server.subprocess.Popen", return_value=mock_process) as mock_popen:
        _run_llm_subprocess(conversation_event_queues, conversation_id, "What is Python?")

    mock_popen.assert_called_once_with(
        ["llm", "--cid", conversation_id, "What is Python?"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
