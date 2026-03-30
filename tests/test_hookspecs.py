from collections.abc import Iterator

import pytest
import sqlite_utils
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.testclient import TestClient

from llm_webchat.event_queues import ConversationEventQueues
from llm_webchat.hookspecs import EventBroadcaster
from llm_webchat.hookspecs import hookimpl
from llm_webchat.plugins import get_plugin_manager
from tests.helpers import insert_conversations


class BroadcasterCapture:
    def __init__(self) -> None:
        self.captured_broadcaster: EventBroadcaster | None = None

    @hookimpl
    def register_event_broadcaster(self, broadcaster: EventBroadcaster) -> None:
        self.captured_broadcaster = broadcaster


@pytest.fixture()
def broadcaster_capture() -> Iterator[BroadcasterCapture]:
    capture = BroadcasterCapture()
    plugin_manager = get_plugin_manager()
    plugin_manager.register(capture)
    yield capture
    plugin_manager.unregister(capture)


def test_register_event_broadcaster_is_called(
    broadcaster_capture: BroadcasterCapture,
    client: TestClient,
) -> None:
    assert broadcaster_capture.captured_broadcaster is not None
    assert callable(broadcaster_capture.captured_broadcaster)


def test_injected_event_arrives_on_registered_queue(
    broadcaster_capture: BroadcasterCapture,
    client: TestClient,
    test_database: sqlite_utils.Database,
) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])

    broadcaster = broadcaster_capture.captured_broadcaster
    assert broadcaster is not None

    conversation_event_queues: ConversationEventQueues = client.app.state.conversation_event_queues  # type: ignore[union-attr]
    event_queue = conversation_event_queues.register("conv1")

    broadcaster("conv1", {"type": "custom_event", "content": "hello from plugin"})

    event = event_queue.get(timeout=1)
    assert event is not None
    assert event["type"] == "custom_event"
    assert event["content"] == "hello from plugin"

    conversation_event_queues.unregister("conv1", event_queue)


class EndpointOverridePlugin:
    @hookimpl
    def endpoint(self, app: FastAPI) -> None:
        app.add_api_route("/api/models", self._custom_models, methods=["GET"])

    @staticmethod
    def _custom_models() -> JSONResponse:
        return JSONResponse(content={"custom": True})


@pytest.fixture()
def endpoint_override_plugin() -> Iterator[EndpointOverridePlugin]:
    plugin = EndpointOverridePlugin()
    plugin_manager = get_plugin_manager()
    plugin_manager.register(plugin)
    yield plugin
    plugin_manager.unregister(plugin)


def test_plugin_can_override_builtin_endpoint(
    endpoint_override_plugin: EndpointOverridePlugin,
    client: TestClient,
) -> None:
    response = client.get("/api/models")
    assert response.status_code == 200
    assert response.json() == {"custom": True}


class SystemPromptInjector:
    def __init__(self, system_prompt: str) -> None:
        self.system_prompt = system_prompt
        self.received_commands: list[list[str]] = []

    @hookimpl
    def modify_llm_prompt_command(self, command: list[str]) -> None:
        self.received_commands.append(command)
        # Insert before the final positional message argument.
        command[-1:-1] = ["--system", self.system_prompt]


class ToolAdder:
    def __init__(self, tool_name: str) -> None:
        self.tool_name = tool_name

    @hookimpl
    def modify_llm_prompt_command(self, command: list[str]) -> None:
        # Insert -T before the final positional message argument.
        command[-1:-1] = ["-T", self.tool_name]


@pytest.fixture()
def system_prompt_injector() -> Iterator[SystemPromptInjector]:
    plugin = SystemPromptInjector("You are a helpful pirate.")
    plugin_manager = get_plugin_manager()
    plugin_manager.register(plugin)
    yield plugin
    plugin_manager.unregister(plugin)


@pytest.fixture()
def tool_adder() -> Iterator[ToolAdder]:
    plugin = ToolAdder("web_search")
    plugin_manager = get_plugin_manager()
    plugin_manager.register(plugin)
    yield plugin
    plugin_manager.unregister(plugin)


def test_modify_llm_prompt_command_injects_system_prompt(
    system_prompt_injector: SystemPromptInjector,
    client: TestClient,
) -> None:
    command = ["llm", "-m", "test-model", "--cid", "conv1", "--td", "--cl", "20", "hello"]

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.modify_llm_prompt_command(command=command)

    assert "--system" in command
    system_index = command.index("--system")
    assert command[system_index + 1] == "You are a helpful pirate."
    assert len(system_prompt_injector.received_commands) == 1
    assert system_prompt_injector.received_commands[0] is command


def test_modify_llm_prompt_command_can_add_tools(
    tool_adder: ToolAdder,
    client: TestClient,
) -> None:
    command = ["llm", "-m", "test-model", "--cid", "conv1", "--td", "--cl", "20", "hello"]

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.modify_llm_prompt_command(command=command)

    assert "-T" in command
    tool_index = command.index("-T")
    assert command[tool_index + 1] == "web_search"
    # Message is still the last argument.
    assert command[-1] == "hello"


def test_multiple_hooks_compose(
    system_prompt_injector: SystemPromptInjector,
    tool_adder: ToolAdder,
    client: TestClient,
) -> None:
    command = ["llm", "-m", "test-model", "--cid", "conv1", "--td", "--cl", "20", "hello"]

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.modify_llm_prompt_command(command=command)

    assert "--system" in command
    assert "-T" in command
    assert command[-1] == "hello"
