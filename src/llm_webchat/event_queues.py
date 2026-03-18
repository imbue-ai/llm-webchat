import queue
import threading
from collections import defaultdict
from typing import Any

from llm_webchat.events import BufferBehavior


class ConversationEventQueues:
    """Thread-safe registry of per-conversation event queues.

    Queues are unbounded, so `put_nowait` is always safe.  The internal
    `threading.Lock` protects the dict/list structure that maps conversation
    IDs to their list of subscriber queues; individual queue.Queue
    operations are independently thread-safe.

    An in-memory replay buffer is maintained per conversation.  Its lifecycle
    is driven by the ``buffer_behavior`` key on each event dict (defaulting
    to ``"store"`` when absent):

    * ``"store"``  — append to the buffer, creating it if absent.
    * ``"ignore"`` — skip the buffer entirely.
    * ``"flush"``  — clear (and remove) the buffer; the event itself is not stored.

    The ``buffer_behavior`` key is stripped before delivery so consumers
    never see it.

    When a new subscriber registers while a buffer exists, all buffered events
    are replayed into the new queue so the client can reconstruct the stream.
    """

    def __init__(self) -> None:
        self._queues: dict[str, list[queue.Queue[dict[str, Any] | None]]] = defaultdict(list)
        self._event_buffers: dict[str, list[dict[str, Any]]] = {}
        self._lock: threading.Lock = threading.Lock()
        self._shutdown: bool = False

    @property
    def is_shutdown(self) -> bool:
        return self._shutdown

    def register(self, conversation_id: str) -> queue.Queue[dict[str, Any] | None]:
        event_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()
        with self._lock:
            if self._shutdown:
                event_queue.put_nowait(None)
                return event_queue
            buffered_events = self._event_buffers.get(conversation_id, [])
            for event in buffered_events:
                event_queue.put_nowait(event)
            self._queues[conversation_id].append(event_queue)
        return event_queue

    def unregister(self, conversation_id: str, event_queue: queue.Queue[dict[str, Any] | None]) -> None:
        with self._lock:
            queues = self._queues.get(conversation_id)
            if queues is not None:
                try:
                    queues.remove(event_queue)
                except ValueError:
                    pass
                if not queues:
                    del self._queues[conversation_id]

    def broadcast(self, conversation_id: str, event: dict[str, Any]) -> None:
        behavior = BufferBehavior(event.get("buffer_behavior", BufferBehavior.STORE))
        clean_event = {key: value for key, value in event.items() if key != "buffer_behavior"}
        with self._lock:
            if behavior is BufferBehavior.STORE:
                if conversation_id not in self._event_buffers:
                    self._event_buffers[conversation_id] = []
                self._event_buffers[conversation_id].append(clean_event)
            elif behavior is BufferBehavior.FLUSH:
                self._event_buffers.pop(conversation_id, None)
            queues = list(self._queues.get(conversation_id, []))
        for event_queue in queues:
            event_queue.put_nowait(clean_event)

    def shutdown(self) -> None:
        with self._lock:
            self._shutdown = True
            for conversation_queues in self._queues.values():
                for event_queue in conversation_queues:
                    event_queue.put_nowait(None)
            self._queues.clear()
            self._event_buffers.clear()
