from enum import Enum


class BufferBehavior(str, Enum):
    """Controls how an event interacts with the per-conversation replay buffer.

    ``STORE``   — append to the buffer (creating it if it does not yet exist).
                  Late-joining subscribers will receive this event on replay.
    ``IGNORE``  — deliver to current subscribers only; never touch the buffer.
                  Suitable for ephemeral/transient events such as notifications.
    ``FLUSH``   — deliver to current subscribers, then clear the entire buffer.
                  The event itself is *not* stored.
    """

    STORE = "store"
    IGNORE = "ignore"
    FLUSH = "flush"
