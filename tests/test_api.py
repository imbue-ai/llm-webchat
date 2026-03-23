import queue
import subprocess
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
import sqlite_utils
from fastapi import FastAPI
from starlette.testclient import TestClient

from llm_webchat.config import Config
from llm_webchat.server import create_application
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
    stderr_lines = [line + b"\n" for line in stderr.split(b"\n") if line] if stderr else []
    mock_process.stderr = MagicMock()
    mock_process.stderr.read = MagicMock(return_value=stderr)
    mock_process.stderr.__iter__ = MagicMock(return_value=iter(stderr_lines))
    return mock_process


def test_create_conversation(client: TestClient, application: FastAPI) -> None:
    response = client.post("/api/conversations", json={"name": "Hello there", "model": "gpt-4"})
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
    assert rows[0]["model"] == "gpt-4"


def test_create_conversation_stores_name_as_given(client: TestClient, application: FastAPI) -> None:
    response = client.post("/api/conversations", json={"name": "My custom name", "model": "gpt-4"})
    assert response.status_code == 201

    database = application.state.database
    data = response.json()
    rows = database.execute("SELECT name FROM conversations WHERE id = ?", [data["id"]]).fetchall()
    assert rows[0]["name"] == "My custom name"


def test_create_conversation_stores_model(client: TestClient, application: FastAPI) -> None:
    response = client.post("/api/conversations", json={"name": "Test", "model": "claude-3-opus"})
    assert response.status_code == 201

    database = application.state.database
    data = response.json()
    rows = database.execute("SELECT model FROM conversations WHERE id = ?", [data["id"]]).fetchall()
    assert rows[0]["model"] == "claude-3-opus"


def test_create_conversation_returns_unique_ids(client: TestClient) -> None:
    response_one = client.post("/api/conversations", json={"name": "First", "model": "gpt-4"})
    response_two = client.post("/api/conversations", json={"name": "Second", "model": "gpt-4"})
    assert response_one.json()["id"] != response_two.json()["id"]


def test_send_message_nonexistent_conversation(client: TestClient, test_database: sqlite_utils.Database) -> None:
    response = client.post(
        "/api/conversations/nonexistent/message",
        json={"message": "Hello", "model": "gpt-4"},
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
            json={"message": "Hi there", "model": "gpt-4"},
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
        _run_llm_subprocess(conversation_event_queues, conversation_id, "Hi", "gpt-4")

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
        _run_llm_subprocess(conversation_event_queues, conversation_id, "Hi", "gpt-4")

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
        _run_llm_subprocess(conversation_event_queues, conversation_id, "What is Python?", "claude-3-opus")

    mock_popen.assert_called_once_with(
        ["llm", "-m", "claude-3-opus", "--cid", conversation_id, "--td", "--cl", "20", "What is Python?"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def test_run_llm_subprocess_calls_llm_with_system_prompt() -> None:
    from llm_webchat.event_queues import ConversationEventQueues
    from llm_webchat.server import _run_llm_subprocess

    conversation_event_queues = ConversationEventQueues()
    conversation_id = "test_system_conv"
    conversation_event_queues.register(conversation_id)

    mock_process = _make_fake_popen([b"response"])

    with patch("llm_webchat.server.subprocess.Popen", return_value=mock_process) as mock_popen:
        _run_llm_subprocess(
            conversation_event_queues,
            conversation_id,
            "Hello",
            "gpt-4",
            system_prompt="You are a helpful assistant.",
        )

    mock_popen.assert_called_once_with(
        [
            "llm",
            "-m",
            "gpt-4",
            "--cid",
            conversation_id,
            "--td",
            "--cl",
            "20",
            "--system",
            "You are a helpful assistant.",
            "Hello",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def test_send_message_with_system_prompt(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])

    with patch("llm_webchat.server.subprocess.Popen") as mock_popen:
        mock_popen.return_value = _make_fake_popen([b"Hello!"])

        response = client.post(
            "/api/conversations/conv1/message",
            json={"message": "Hi there", "model": "gpt-4", "system_prompt": "Be concise."},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_parse_tool_names() -> None:
    from llm_webchat.server import _parse_tool_names

    output = (
        "llm_time() -> dict (plugin: llm.default_plugins.default_tools)\n"
        "\n"
        "  Returns the current time, as local time and UTC\n"
        "\n"
        "llm_version() -> str (plugin: llm.default_plugins.default_tools)\n"
        "\n"
        "  Return the installed version of llm\n"
    )
    assert _parse_tool_names(output) == ["llm_time", "llm_version"]


def test_parse_tool_names_empty() -> None:
    from llm_webchat.server import _parse_tool_names

    assert _parse_tool_names("") == []
    assert _parse_tool_names("\n\n") == []


def test_list_tools(client: TestClient) -> None:
    mock_result = MagicMock()
    mock_result.stdout = (
        "llm_time() -> dict (plugin: llm.default_plugins.default_tools)\n"
        "\n"
        "  Returns the current time\n"
        "\n"
        "llm_version() -> str (plugin: llm.default_plugins.default_tools)\n"
        "\n"
        "  Return the installed version of llm\n"
    )

    with patch("llm_webchat.server.subprocess.run", return_value=mock_result):
        response = client.get("/api/tools")

    assert response.status_code == 200
    data = response.json()
    assert "tools" in data
    assert len(data["tools"]) == 2
    assert data["tools"][0]["tool_name"] == "llm_time"
    assert data["tools"][1]["tool_name"] == "llm_version"


def test_run_llm_subprocess_calls_llm_with_tools() -> None:
    from llm_webchat.event_queues import ConversationEventQueues
    from llm_webchat.server import _run_llm_subprocess

    conversation_event_queues = ConversationEventQueues()
    conversation_id = "test_tools_conv"
    conversation_event_queues.register(conversation_id)

    mock_process = _make_fake_popen([b"response"])

    with patch("llm_webchat.server.subprocess.Popen", return_value=mock_process) as mock_popen:
        _run_llm_subprocess(
            conversation_event_queues,
            conversation_id,
            "What time is it?",
            "gpt-4",
            tools=["llm_time", "llm_version"],
        )

    mock_popen.assert_called_once_with(
        [
            "llm",
            "-m",
            "gpt-4",
            "--cid",
            conversation_id,
            "--td",
            "--cl",
            "20",
            "-T",
            "llm_time",
            "-T",
            "llm_version",
            "What time is it?",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def test_send_message_with_tools(client: TestClient, test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])

    with patch("llm_webchat.server.subprocess.Popen") as mock_popen:
        mock_popen.return_value = _make_fake_popen([b"Hello!"])

        response = client.post(
            "/api/conversations/conv1/message",
            json={"message": "What time is it?", "model": "gpt-4", "tools": ["llm_time"]},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_list_models(client: TestClient) -> None:
    mock_model_1 = MagicMock()
    mock_model_1.model_id = "gpt-4"
    mock_model_2 = MagicMock()
    mock_model_2.model_id = "claude-3-opus"

    with patch("llm.get_models", return_value=[mock_model_1, mock_model_2]):
        response = client.get("/api/models")

    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert len(data["models"]) == 2
    assert data["models"][0]["model_id"] == "gpt-4"
    assert data["models"][1]["model_id"] == "claude-3-opus"


@pytest.fixture()
def plugin_files(tmp_path: Path) -> list[Path]:
    plugin_one = tmp_path / "plugin_one.js"
    plugin_one.write_text('window.$llm.on("ready", () => console.log("plugin one"));')
    plugin_two = tmp_path / "plugin_two.js"
    plugin_two.write_text('window.$llm.on("ready", () => console.log("plugin two"));')
    return [plugin_one, plugin_two]


@pytest.fixture()
def client_with_plugins(llm_user_path: Path, plugin_files: list[Path]) -> Iterator[TestClient]:
    application = create_application(
        Config(llm_webchat_javascript_plugins=[str(path) for path in plugin_files]),
    )
    with TestClient(application) as test_client:
        yield test_client


def test_serve_javascript_plugin_by_basename(client_with_plugins: TestClient, plugin_files: list[Path]) -> None:
    response = client_with_plugins.get("/plugins/plugin_one.js")
    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert response.text == plugin_files[0].read_text()

    response = client_with_plugins.get("/plugins/plugin_two.js")
    assert response.status_code == 200
    assert response.text == plugin_files[1].read_text()


def test_serve_javascript_plugin_unknown_basename(client_with_plugins: TestClient) -> None:
    response = client_with_plugins.get("/plugins/nonexistent.js")
    assert response.status_code == 404


def test_serve_javascript_plugin_no_plugins_configured(client: TestClient) -> None:
    response = client.get("/plugins/anything.js")
    assert response.status_code == 404


def _make_static_directory_with_index_html(base_path: Path) -> Path:
    static_directory = base_path / "static"
    static_directory.mkdir(parents=True, exist_ok=True)
    index_html = static_directory / "index.html"
    index_html.write_text('<html><head></head><body><div id="app"></div></body></html>')
    return static_directory


def test_index_injects_plugin_script_tags(client_with_plugins: TestClient, plugin_files: list[Path]) -> None:
    import llm_webchat.server as server_module

    original_static = server_module.STATIC_DIRECTORY
    try:
        server_module.STATIC_DIRECTORY = _make_static_directory_with_index_html(plugin_files[0].parent)

        response = client_with_plugins.get("/")
        assert response.status_code == 200
        assert '<script src="/plugins/plugin_one.js"></script>' in response.text
        assert '<script src="/plugins/plugin_two.js"></script>' in response.text

        body = response.text
        plugin_one_position = body.index("plugin_one.js")
        plugin_two_position = body.index("plugin_two.js")
        closing_body_position = body.index("</body>")
        assert plugin_one_position < plugin_two_position < closing_body_position
    finally:
        server_module.STATIC_DIRECTORY = original_static


def test_index_without_plugins_has_no_plugin_script_tags(client: TestClient, tmp_path: Path) -> None:
    import llm_webchat.server as server_module

    original_static = server_module.STATIC_DIRECTORY
    try:
        server_module.STATIC_DIRECTORY = _make_static_directory_with_index_html(tmp_path)

        response = client.get("/")
        assert response.status_code == 200
        assert "/plugins/" not in response.text
    finally:
        server_module.STATIC_DIRECTORY = original_static


def test_duplicate_plugin_basenames_raises_error(tmp_path: Path) -> None:
    from pydantic import ValidationError

    from llm_webchat.config import Config

    dir_one = tmp_path / "a"
    dir_one.mkdir()
    dir_two = tmp_path / "b"
    dir_two.mkdir()
    (dir_one / "plugin.js").write_text("")
    (dir_two / "plugin.js").write_text("")

    with pytest.raises(ValidationError, match="Duplicate static basename 'plugin.js'"):
        Config(
            llm_webchat_javascript_plugins=[
                str(dir_one / "plugin.js"),
                str(dir_two / "plugin.js"),
            ],
        )


def test_duplicate_basenames_across_plugins_and_static_paths_raises_error(tmp_path: Path) -> None:
    from pydantic import ValidationError

    from llm_webchat.config import Config

    dir_one = tmp_path / "a"
    dir_one.mkdir()
    dir_two = tmp_path / "b"
    dir_two.mkdir()
    (dir_one / "shared.js").write_text("")
    (dir_two / "shared.js").write_text("")

    with pytest.raises(ValidationError, match="Duplicate static basename 'shared.js'"):
        Config(
            llm_webchat_javascript_plugins=[str(dir_one / "shared.js")],
            llm_webchat_static_paths=[str(dir_two / "shared.js")],
        )


@pytest.fixture()
def static_asset_files(tmp_path: Path) -> list[Path]:
    css_file = tmp_path / "styles.css"
    css_file.write_text("body { color: red; }")
    image_file = tmp_path / "icon.png"
    image_file.write_bytes(b"\x89PNG\r\n\x1a\n")
    return [css_file, image_file]


@pytest.fixture()
def client_with_static_paths(llm_user_path: Path, static_asset_files: list[Path]) -> Iterator[TestClient]:
    application = create_application(
        Config(llm_webchat_static_paths=[str(path) for path in static_asset_files]),
    )
    with TestClient(application) as test_client:
        yield test_client


def test_serve_static_path_by_basename(client_with_static_paths: TestClient, static_asset_files: list[Path]) -> None:
    response = client_with_static_paths.get("/plugins/styles.css")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
    assert response.text == static_asset_files[0].read_text()

    response = client_with_static_paths.get("/plugins/icon.png")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")


def test_static_paths_not_injected_as_script_tags(
    static_asset_files: list[Path], tmp_path: Path, llm_user_path: Path
) -> None:
    import llm_webchat.server as server_module

    original_static = server_module.STATIC_DIRECTORY
    try:
        server_module.STATIC_DIRECTORY = _make_static_directory_with_index_html(tmp_path / "frontend")
        application = create_application(
            Config(llm_webchat_static_paths=[str(path) for path in static_asset_files]),
        )
        with TestClient(application) as test_client:
            response = test_client.get("/")
            assert response.status_code == 200
            assert "/plugins/" not in response.text
    finally:
        server_module.STATIC_DIRECTORY = original_static


def test_mixed_plugins_and_static_paths(
    plugin_files: list[Path], static_asset_files: list[Path], tmp_path: Path, llm_user_path: Path
) -> None:
    import llm_webchat.server as server_module

    original_static = server_module.STATIC_DIRECTORY
    try:
        server_module.STATIC_DIRECTORY = _make_static_directory_with_index_html(tmp_path / "frontend")
        application = create_application(
            Config(
                llm_webchat_javascript_plugins=[str(path) for path in plugin_files],
                llm_webchat_static_paths=[str(path) for path in static_asset_files],
            ),
        )
        with TestClient(application) as test_client:
            # JS plugins are served
            response = test_client.get("/plugins/plugin_one.js")
            assert response.status_code == 200
            assert "javascript" in response.headers["content-type"]

            # Static assets are served
            response = test_client.get("/plugins/styles.css")
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/css")

            # Only JS plugins are injected as script tags
            response = test_client.get("/")
            assert response.status_code == 200
            assert "plugin_one.js" in response.text
            assert "plugin_two.js" in response.text
            assert "styles.css" not in response.text
            assert "icon.png" not in response.text
    finally:
        server_module.STATIC_DIRECTORY = original_static
