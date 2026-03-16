import queue
import threading

from llm_webchat.event_queues import ConversationEventQueues


def test_register_returns_queue() -> None:
    queues = ConversationEventQueues()
    registered_queue = queues.register("conv1")
    assert isinstance(registered_queue, queue.Queue)


def test_broadcast_delivers_to_registered_queue() -> None:
    queues = ConversationEventQueues()
    queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "message_delta", "content": "hello"})

    event = queue.get_nowait()
    assert event == {"type": "message_delta", "content": "hello"}


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
    queue = queues.register("conv1")

    queues.unregister("conv1", queue)
    queues.broadcast("conv1", {"type": "message_start"})

    assert queue.empty()


def test_unregister_only_removes_specified_queue() -> None:
    queues = ConversationEventQueues()
    queue_a = queues.register("conv1")
    queue_b = queues.register("conv1")

    queues.unregister("conv1", queue_a)
    queues.broadcast("conv1", {"type": "message_start"})

    assert queue_a.empty()
    assert queue_b.get_nowait() == {"type": "message_start"}


def test_register_replays_buffered_events_for_active_flow() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "Hi "})
    queues.broadcast("conv1", {"type": "message_delta", "content": "there!"})

    late_queue = queues.register("conv1")

    events: list[dict[str, str]] = []
    while not late_queue.empty():
        event = late_queue.get_nowait()
        if event is not None:
            events.append(event)

    assert len(events) == 4
    assert events[0] == {"type": "user_message", "content": "Hello"}
    assert events[1] == {"type": "message_start"}
    assert events[2] == {"type": "message_delta", "content": "Hi "}
    assert events[3] == {"type": "message_delta", "content": "there!"}


def test_buffer_cleared_after_message_end() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply"})
    queues.broadcast("conv1", {"type": "message_end"})

    late_queue = queues.register("conv1")
    assert late_queue.empty()


def test_buffer_reset_on_new_user_message() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "First"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply1"})
    queues.broadcast("conv1", {"type": "message_end"})

    queues.broadcast("conv1", {"type": "user_message", "content": "Second"})
    queues.broadcast("conv1", {"type": "message_start"})
    queues.broadcast("conv1", {"type": "message_delta", "content": "reply2"})

    late_queue = queues.register("conv1")

    events: list[dict[str, str]] = []
    while not late_queue.empty():
        event = late_queue.get_nowait()
        if event is not None:
            events.append(event)

    assert events[0] == {"type": "user_message", "content": "Second"}
    assert events[1] == {"type": "message_start"}
    assert events[2] == {"type": "message_delta", "content": "reply2"}


def test_late_subscriber_also_receives_live_events_after_replay() -> None:
    queues = ConversationEventQueues()
    queues.register("conv1")

    queues.broadcast("conv1", {"type": "user_message", "content": "Hello"})
    queues.broadcast("conv1", {"type": "message_start"})

    late_queue = queues.register("conv1")

    queues.broadcast("conv1", {"type": "message_delta", "content": "live"})
    queues.broadcast("conv1", {"type": "message_end"})

    events: list[dict[str, str]] = []
    while not late_queue.empty():
        event = late_queue.get_nowait()
        if event is not None:
            events.append(event)

    assert events[0] == {"type": "user_message", "content": "Hello"}
    assert events[1] == {"type": "message_start"}
    assert events[2] == {"type": "message_delta", "content": "live"}
    assert events[3] == {"type": "message_end"}


def test_no_buffer_for_conversations_without_active_flow() -> None:
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

    events: list[dict[str, str]] = []
    while not late_queue.empty():
        event = late_queue.get_nowait()
        if event is not None:
            events.append(event)

    assert len(events) == 3
    assert events[2] == {"type": "error", "content": "Something went wrong"}


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
    collected_events: list[dict[str, str]] = []
    barrier = threading.Barrier(2)

    def broadcaster() -> None:
        barrier.wait()
        for i in range(100):
            queues.broadcast("conv1", {"type": "message_delta", "content": str(i)})

    def registrar() -> None:
        barrier.wait()
        for _ in range(100):
            queue = queues.register("conv1")
            queues.unregister("conv1", queue)
            while not queue.empty():
                event = queue.get_nowait()
                if event is not None:
                    collected_events.append(event)

    thread_broadcast = threading.Thread(target=broadcaster)
    thread_register = threading.Thread(target=registrar)

    thread_broadcast.start()
    thread_register.start()
    thread_broadcast.join()
    thread_register.join()
