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
