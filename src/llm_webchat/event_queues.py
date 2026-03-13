import queue
import threading
from collections import defaultdict


class ConversationEventQueues:
    """Thread-safe registry of per-conversation event queues.

    Queues are unbounded, so `put_nowait` is always safe.  The internal
    `threading.Lock` protects the dict/list structure that maps conversation
    IDs to their list of subscriber queues; individual queue.Queue
    operations are independently thread-safe.
    """

    def __init__(self) -> None:
        self._queues: dict[str, list[queue.Queue[dict[str, str] | None]]] = defaultdict(list)
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
