import queue
import threading
from collections import defaultdict


class ConversationEventQueues:
    """Thread-safe registry of per-conversation event queues.

    Queues are unbounded, so `put_nowait` is always safe.  The internal
    `threading.Lock` protects the dict/list structure that maps conversation
    IDs to their list of subscriber queues; individual queue.Queue
    operations are independently thread-safe.

    An in-memory event buffer is maintained for each conversation that has
    an active LLM flow.  When a new subscriber registers while a flow is
    in progress, all previously buffered events are replayed into the new
    queue so the client can reconstruct the full stream.  The buffer is
    cleared once a ``message_end`` event is broadcast.
    """

    def __init__(self) -> None:
        self._queues: dict[str, list[queue.Queue[dict[str, str] | None]]] = defaultdict(list)
        self._event_buffers: dict[str, list[dict[str, str]]] = {}
        self._lock: threading.Lock = threading.Lock()
        self._shutdown: bool = False

    @property
    def is_shutdown(self) -> bool:
        return self._shutdown

    def register(self, conversation_id: str) -> queue.Queue[dict[str, str] | None]:
        event_queue: queue.Queue[dict[str, str] | None] = queue.Queue()
        with self._lock:
            if self._shutdown:
                event_queue.put_nowait(None)
                return event_queue
            buffered_events = self._event_buffers.get(conversation_id, [])
            for event in buffered_events:
                event_queue.put_nowait(event)
            self._queues[conversation_id].append(event_queue)
        return event_queue

    def unregister(self, conversation_id: str, event_queue: queue.Queue[dict[str, str] | None]) -> None:
        with self._lock:
            queues = self._queues.get(conversation_id)
            if queues is not None:
                try:
                    queues.remove(event_queue)
                except ValueError:
                    pass
                if not queues:
                    del self._queues[conversation_id]

    def broadcast(self, conversation_id: str, event: dict[str, str]) -> None:
        with self._lock:
            if event.get("type") == "user_message":
                self._event_buffers[conversation_id] = []
            if conversation_id in self._event_buffers:
                self._event_buffers[conversation_id].append(event)
            if event.get("type") == "message_end":
                self._event_buffers.pop(conversation_id, None)
            queues = list(self._queues.get(conversation_id, []))
        for event_queue in queues:
            event_queue.put_nowait(event)

    def shutdown(self) -> None:
        with self._lock:
            self._shutdown = True
            for conversation_queues in self._queues.values():
                for event_queue in conversation_queues:
                    event_queue.put_nowait(None)
            self._queues.clear()
            self._event_buffers.clear()
