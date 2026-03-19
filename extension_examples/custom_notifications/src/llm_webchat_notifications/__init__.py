from __future__ import annotations

import json
import logging
import os
import queue
import threading
from pathlib import Path
from typing import Any

import click
import llm
import uvicorn
from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse

from llm_webchat.config import load_config
from llm_webchat.events import BufferBehavior
from llm_webchat.hookspecs import EventBroadcaster
from llm_webchat.hookspecs import hookimpl
from llm_webchat.plugins import get_plugin_manager
from llm_webchat.server import _list_conversations_endpoint
from llm_webchat.server import create_application

logger = logging.getLogger(__name__)

STATIC_DIRECTORY = Path(__file__).parent / "static"


class NotificationPlugin:
    """Monitors all known conversations and rebroadcasts a ``ResponseCompleteEvent``
    to every *other* conversation when one finishes, so the frontend can show a
    notification badge without opening extra SSE connections.

    Works by:
    1. Overriding GET ``/api/conversations`` to track known conversation IDs.
    2. Registering an event queue for each conversation via ``ConversationEventQueues``.
    3. Running a background thread per conversation that reads from the queue
       and, upon seeing ``message_end``, uses the stored broadcaster to send
       ``ResponseCompleteEvent`` to all other known conversations.
    """

    def __init__(self) -> None:
        self._broadcaster: EventBroadcaster | None = None
        self._known_conversation_ids: set[str] = set()
        self._conversation_queues: dict[str, queue.Queue[dict[str, Any] | None]] = {}
        self._lock: threading.Lock = threading.Lock()

    @hookimpl
    def register_event_broadcaster(self, broadcaster: EventBroadcaster) -> None:
        self._broadcaster = broadcaster

    @hookimpl
    def endpoint(self, app: FastAPI) -> None:
        @app.get("/api/conversations")
        def list_conversations_with_tracking(request: Request, count: int = 10) -> JSONResponse:
            response = _list_conversations_endpoint(request, count)
            if response.status_code != 200:  # type: ignore[union-attr]
                return response  # type: ignore[return-value]

            body = json.loads(response.body)  # type: ignore[union-attr]
            conversation_ids = {conversation["id"] for conversation in body["conversations"]}

            conversation_event_queues = request.app.state.conversation_event_queues
            with self._lock:
                new_ids = conversation_ids - self._known_conversation_ids
                removed_ids = self._known_conversation_ids - conversation_ids
                self._known_conversation_ids = set(conversation_ids)

            for conversation_id in removed_ids:
                removed_queue = self._conversation_queues.pop(conversation_id, None)
                if removed_queue is not None:
                    removed_queue.put_nowait(None)
                    conversation_event_queues.unregister(conversation_id, removed_queue)

            for conversation_id in new_ids:
                event_queue = conversation_event_queues.register(conversation_id)
                self._conversation_queues[conversation_id] = event_queue
                thread = threading.Thread(
                    target=self._monitor_conversation,
                    args=(conversation_id, event_queue),
                    daemon=True,
                )
                thread.start()

            return response  # type: ignore[return-value]

    def _monitor_conversation(
        self,
        conversation_id: str,
        event_queue: queue.Queue[dict[str, Any] | None],
    ) -> None:
        while True:
            try:
                event = event_queue.get()
            except Exception:
                break
            if event is None:
                break
            if event.get("type") == "message_end" and self._broadcaster is not None:
                with self._lock:
                    other_ids = self._known_conversation_ids - {conversation_id}
                for other_id in other_ids:
                    self._broadcaster(
                        other_id,
                        {
                            "type": "response_complete",
                            "content": conversation_id,
                            "buffer_behavior": BufferBehavior.IGNORE,
                        },
                    )


@llm.hookimpl
def register_commands(cli: click.Group) -> None:
    @cli.command(name="webchat-with-notifications")
    def webchat_with_notifications() -> None:
        """Open a web chat interface with notification badges for background conversations."""
        notification_plugin = NotificationPlugin()
        get_plugin_manager().register(notification_plugin)

        javascript_plugin_path = str(STATIC_DIRECTORY / "notifications.js")
        existing_plugins = os.environ.get("LLM_WEBCHAT_JAVASCRIPT_PLUGINS", "")
        if existing_plugins:
            os.environ["LLM_WEBCHAT_JAVASCRIPT_PLUGINS"] = f"{existing_plugins},{javascript_plugin_path}"
        else:
            os.environ["LLM_WEBCHAT_JAVASCRIPT_PLUGINS"] = javascript_plugin_path

        config = load_config()
        application = create_application(config)
        uvicorn.run(application, host=config.llm_webchat_host, port=config.llm_webchat_port)
