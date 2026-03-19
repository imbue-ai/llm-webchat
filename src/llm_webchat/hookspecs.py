from collections.abc import Callable
from typing import Any

import pluggy
from fastapi import FastAPI

hookspec = pluggy.HookspecMarker("llm_webchat")
hookimpl = pluggy.HookimplMarker("llm_webchat")

EventBroadcaster = Callable[[str, dict[str, Any]], None]


class LlmWebchatHookSpec:
    @hookspec
    def endpoint(self, app: FastAPI) -> None:
        """Register additional endpoints or override built-in endpoints on the FastAPI application.

        Plugin routes are registered before built-in routes, so a plugin may override
        a built-in endpoint by registering a route with the same path and method.
        """

    @hookspec
    def register_event_broadcaster(self, broadcaster: EventBroadcaster) -> None:
        """Receive a reference to the event broadcaster for injecting events into conversation streams.

        The broadcaster callable has the signature
        ``(conversation_id: str, event: dict[str, Any]) -> None``.
        Implementations may store this reference and call it at any time to inject
        custom events into the stream for a given conversation.

        Events are plain dicts.  Every event must have a ``"type"`` key.  An optional
        ``"buffer_behavior"`` key (``"store"``, ``"ignore"``, or ``"flush"``) controls
        replay-buffer semantics; it defaults to ``"store"`` and is stripped before
        delivery to subscribers.
        """
