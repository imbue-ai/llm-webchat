import queue
import threading
from typing import Any

from llm_webchat.event_queues import ConversationEventQueues
from llm_webchat.events import BufferBehavior


def test_register_returns_queue() -> None:
    queues = ConversationEventQueues()
    registered_queue = queues.register("conv1")
    assert isinstance(registered_queue, queue.Queue)


def test_broadcast_delivers_to_registered_queue() -> None:
    queues = ConversationEventQueues()
    event_queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "message_delta", "content": "hello"})

    event = event_queue.get_nowait()
    assert event == {"type": "message_delta", "content": "hello"}


def test_broadcast_strips_buffer_behavior_from_delivered_event() -> None:
    queues = ConversationEventQueues()
    event_queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH})

    event = event_queue.get_nowait()
    assert "buffer_behavior" not in event
    assert event == {"type": "message_end"}


def test_broadcast_does_not_mutate_input_event() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    original: dict[str, Any] = {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH}
    queues.broadcast("conv1", original)

    assert "buffer_behavior" in original


def test_broadcast_delivers_to_multiple_queues() -> None:
    queues = ConversationEventQueues()
    queue_a = queues.register("conv1")
    queue_b = queues.register("conv1")

    queues.broadcast("conv1", {"type": "message_start"})

    assert queue_a.get_nowait() == {"type": "message_start"}
    assert queue_b.get_nowait() == {"type": "message_start"}


def test_broadcast_does_not_deliver_to_other_conversations() -> None:
    queues = ConversationEventQueues()
    queue_conv1 = queues.register("conv1")
    queue_conv2 = queues.register("conv2")

    queues.broadcast("conv1", {"type": "message_start"})

    assert queue_conv1.get_nowait() == {"type": "message_start"}
    assert queue_conv2.empty()


def test_unregister_removes_queue() -> None:
    queues = ConversationEventQueues()
    event_queue = queues.register("conv1")

    queues.unregister("conv1", event_queue)
    queues.broadcast("conv1", {"type": "message_start"})

    assert event_queue.empty()


def test_unregister_only_removes_specified_queue() -> None:
    queues = ConversationEventQueues()
    queue_a = queues.register("conv1")
    queue_b = queues.register("conv1")

    queues.unregister("conv1", queue_a)
    queues.broadcast("conv1", {"type": "message_start"})

    assert queue_a.empty()
    assert queue_b.get_nowait() == {"type": "message_start"}


def test_store_events_create_buffer_and_replay() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "Hi "})
    queues.broadcast("conv1", {"type": "message_delta", "content": "there!"})

    late_queue = queues.register("conv1")

    events = _drain(late_queue)

    assert len(events) == 4
    assert events[0] == {"type": "user_message", "content": "Hello"}
    assert events[1] == {"type": "message_start"}
    assert events[2] == {"type": "message_delta", "content": "Hi "}
    assert events[3] == {"type": "message_delta", "content": "there!"}


def test_flush_clears_buffer() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply"})
    queues.broadcast("conv1", {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH})

    late_queue = queues.register("conv1")
    assert late_queue.empty()


def test_flush_event_itself_not_buffered() -> None:
    queues = ConversationEventQueues()
    live_queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH})

    events = _drain(live_queue)
    assert any(event["type"] == "message_end" for event in events)

    late_queue = queues.register("conv1")
    assert late_queue.empty()


def test_new_store_after_flush_creates_fresh_buffer() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "First"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply1"})
    queues.broadcast("conv1", {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH})

    queues.broadcast("conv1", {"type": "user_message", "content": "Second"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply2"})

    late_queue = queues.register("conv1")

    events = _drain(late_queue)

    assert events[0] == {"type": "user_message", "content": "Second"}
    assert events[1] == {"type": "message_start"}
    assert events[2] == {"type": "message_delta", "content": "reply2"}


def test_late_subscriber_receives_replay_then_live_events() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})

    late_queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "message_delta", "content": "live"})
    queues.broadcast("conv1", {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH})

    events = _drain(late_queue)

    assert events[0] == {"type": "user_message", "content": "Hello"}
    assert events[1] == {"type": "message_start"}
    assert events[2] == {"type": "message_delta", "content": "live"}
    assert events[3] == {"type": "message_end"}


def test_no_buffer_for_conversations_without_events() -> None:
    queues = ConversationEventQueues()
    new_queue = queues.register("conv1")
    assert new_queue.empty()


def test_buffer_includes_error_events() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "error", "content": "Something went wrong"})

    late_queue = queues.register("conv1")

    events = _drain(late_queue)

    assert len(events) == 3
    assert events[2] == {"type": "error", "content": "Something went wrong"}


def test_ignore_events_not_replayed() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "notification", "buffer_behavior": BufferBehavior.IGNORE})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply"})

    late_queue = queues.register("conv1")

    events = _drain(late_queue)
    event_types = [event["type"] for event in events]
    assert "notification" not in event_types
    assert event_types == ["user_message", "message_start", "message_delta"]


def test_ignore_events_delivered_to_current_subscribers() -> None:
    queues = ConversationEventQueues()
    live_queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "notification", "buffer_behavior": BufferBehavior.IGNORE})

    events = _drain(live_queue)
    event_types = [event["type"] for event in events]
    assert "notification" in event_types


def test_default_buffer_behavior_is_store() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "custom_event", "content": "stored"})

    late_queue = queues.register("conv1")
    events = _drain(late_queue)
    assert len(events) == 1
    assert events[0] == {"type": "custom_event", "content": "stored"}


def test_shutdown_clears_buffers() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})

    queues.shutdown()

    new_queue = queues.register("conv1")
    event = new_queue.get_nowait()
    assert event is None


def test_concurrent_register_and_broadcast() -> None:
    queues = ConversationEventQueues()
    collected_events: list[dict[str, Any]] = []
    barrier = threading.Barrier(2)

    def broadcaster() -> None:
        barrier.wait()
        for i in range(100):
            queues.broadcast("conv1", {"type": "message_delta", "content": str(i)})

    def registrar() -> None:
        barrier.wait()
        for _ in range(100):
            event_queue = queues.register("conv1")
            queues.unregister("conv1", event_queue)
            while not event_queue.empty():
                event = event_queue.get_nowait()
                if event is not None:
                    collected_events.append(event)

    thread_broadcast = threading.Thread(target=broadcaster)
    thread_register = threading.Thread(target=registrar)

    thread_broadcast.start()
    thread_register.start()
    thread_broadcast.join()
    thread_register.join()


def _drain(event_queue: queue.Queue[dict[str, Any] | None]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    while not event_queue.empty():
        event = event_queue.get_nowait()
        if event is not None:
            events.append(event)
    return events
