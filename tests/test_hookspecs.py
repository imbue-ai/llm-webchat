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
