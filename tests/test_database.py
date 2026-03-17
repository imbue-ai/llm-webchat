import pytest
import sqlite_utils

from llm_webchat.database import conversation_exists
from llm_webchat.database import list_conversations
from llm_webchat.database import list_responses
from llm_webchat.models import Conversation
from llm_webchat.models import ResponseItem
from tests.helpers import insert_conversations
from tests.helpers import insert_responses


def test_list_conversations_empty_database(test_database: sqlite_utils.Database) -> None:
    result = list_conversations(test_database)
    assert result == []


def test_list_conversations_returns_conversations(test_database: sqlite_utils.Database) -> None:
    insert_conversations(
        test_database,
        [
            {"id": "abc", "name": "First chat", "model": "gpt-4"},
            {"id": "def", "name": "Second chat", "model": "claude-3"},
        ],
    )
    result = list_conversations(test_database)
    assert len(result) == 2
    assert result[0] == Conversation(id="def", name="Second chat", model="claude-3")
    assert result[1] == Conversation(id="abc", name="First chat", model="gpt-4")


def test_list_conversations_respects_count(test_database: sqlite_utils.Database) -> None:
    insert_conversations(
        test_database,
        [
            {"id": "1", "name": "Chat 1", "model": "gpt-4"},
            {"id": "2", "name": "Chat 2", "model": "gpt-4"},
            {"id": "3", "name": "Chat 3", "model": "gpt-4"},
        ],
    )
    result = list_conversations(test_database, count=2)
    assert len(result) == 2
    assert result[0].id == "3"
    assert result[1].id == "2"


def test_list_conversations_handles_null_name(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "abc", "name": None, "model": "gpt-4"}])
    result = list_conversations(test_database)
    assert result[0].name == ""


def test_list_conversations_ordered_most_recent_first(test_database: sqlite_utils.Database) -> None:
    insert_conversations(
        test_database,
        [
            {"id": "old", "name": "Old", "model": "gpt-4"},
            {"id": "mid", "name": "Mid", "model": "gpt-4"},
            {"id": "new", "name": "New", "model": "gpt-4"},
        ],
    )
    result = list_conversations(test_database)
    assert [c.id for c in result] == ["new", "mid", "old"]


def test_list_conversations_with_allowed_ids(
    monkeypatch: pytest.MonkeyPatch, test_database: sqlite_utils.Database
) -> None:
    monkeypatch.setenv("LLM_WEBCHAT_CONVERSATION_IDS", "abc,ghi")
    insert_conversations(
        test_database,
        [
            {"id": "abc", "name": "First", "model": "gpt-4"},
            {"id": "def", "name": "Second", "model": "gpt-4"},
            {"id": "ghi", "name": "Third", "model": "gpt-4"},
        ],
    )
    result = list_conversations(test_database)
    assert len(result) == 2
    assert {c.id for c in result} == {"abc", "ghi"}


def test_conversation_exists_returns_false_for_empty_database(test_database: sqlite_utils.Database) -> None:
    assert conversation_exists(test_database, "nonexistent") is False


def test_conversation_exists_returns_false_for_missing_conversation(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "abc", "name": "Test", "model": "gpt-4"}])
    assert conversation_exists(test_database, "nonexistent") is False


def test_conversation_exists_returns_true_for_existing_conversation(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "abc", "name": "Test", "model": "gpt-4"}])
    assert conversation_exists(test_database, "abc") is True


def test_list_responses_empty_database(test_database: sqlite_utils.Database) -> None:
    result = list_responses(test_database, "nonexistent")
    assert result == []


def test_list_responses_returns_responses(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "resp1",
                "model": "gpt-4",
                "prompt": "Hello",
                "system": None,
                "response": "Hi there!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": 5,
                "output_tokens": 10,
            },
            {
                "id": "resp2",
                "model": "gpt-4",
                "prompt": "How are you?",
                "system": None,
                "response": "I'm fine!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:01:00",
                "duration_ms": 200,
                "input_tokens": 8,
                "output_tokens": 6,
            },
        ],
    )
    result = list_responses(test_database, "conv1")
    assert len(result) == 2
    assert result[0] == ResponseItem(
        id="resp1",
        model="gpt-4",
        prompt="Hello",
        system=None,
        response="Hi there!",
        conversation_id="conv1",
        datetime_utc="2025-01-01T00:00:00",
        duration_ms=100,
        input_tokens=5,
        output_tokens=10,
    )
    assert result[1].id == "resp2"


def test_list_responses_filters_by_conversation(test_database: sqlite_utils.Database) -> None:
    insert_conversations(
        test_database,
        [
            {"id": "conv1", "name": "Chat 1", "model": "gpt-4"},
            {"id": "conv2", "name": "Chat 2", "model": "gpt-4"},
        ],
    )
    insert_responses(
        test_database,
        [
            {
                "id": "resp1",
                "model": "gpt-4",
                "prompt": "Hello",
                "system": None,
                "response": "Hi!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": None,
                "output_tokens": None,
            },
            {
                "id": "resp2",
                "model": "gpt-4",
                "prompt": "Bye",
                "system": None,
                "response": "Goodbye!",
                "conversation_id": "conv2",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": None,
                "output_tokens": None,
            },
        ],
    )
    result = list_responses(test_database, "conv1")
    assert len(result) == 1
    assert result[0].id == "resp1"


def test_list_responses_ordered_by_datetime(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "resp_late",
                "model": "gpt-4",
                "prompt": "Late",
                "system": None,
                "response": "Late response",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:02:00",
                "duration_ms": None,
                "input_tokens": None,
                "output_tokens": None,
            },
            {
                "id": "resp_early",
                "model": "gpt-4",
                "prompt": "Early",
                "system": None,
                "response": "Early response",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": None,
                "input_tokens": None,
                "output_tokens": None,
            },
        ],
    )
    result = list_responses(test_database, "conv1")
    assert result[0].id == "resp_early"
    assert result[1].id == "resp_late"


def test_list_responses_with_null_prompt(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "resp1",
                "model": "gpt-4",
                "prompt": None,
                "system": None,
                "response": "Injected response",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": None,
                "input_tokens": None,
                "output_tokens": None,
            },
        ],
    )
    result = list_responses(test_database, "conv1")
    assert len(result) == 1
    assert result[0].prompt is None
    assert result[0].response == "Injected response"
