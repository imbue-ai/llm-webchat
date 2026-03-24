import pytest
import sqlite_utils

from llm_webchat.database import conversation_exists
from llm_webchat.database import list_conversations
from llm_webchat.database import list_responses
from llm_webchat.models import Conversation
from llm_webchat.models import ResponseItem
from tests.helpers import insert_conversations
from tests.helpers import insert_responses
from tests.helpers import insert_tool_calls
from tests.helpers import insert_tool_results


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


def test_list_responses_merges_tool_use_chain(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "r1",
                "model": "gpt-4",
                "prompt": "What time is it?",
                "system": None,
                "response": "",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": 10,
                "output_tokens": 5,
            },
            {
                "id": "r2",
                "model": "gpt-4",
                "prompt": "",
                "system": None,
                "response": "The current time is 3:40 PM UTC.",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:01",
                "duration_ms": 200,
                "input_tokens": 20,
                "output_tokens": 10,
            },
        ],
    )
    insert_tool_calls(
        test_database,
        [
            {
                "id": 1,
                "response_id": "r1",
                "tool_id": 1,
                "name": "llm_time",
                "arguments": "{}",
                "tool_call_id": "tc_1",
            },
        ],
    )
    insert_tool_results(
        test_database,
        [
            {
                "id": 1,
                "response_id": "r2",
                "tool_id": 1,
                "name": "llm_time",
                "output": '{"time": "15:40"}',
                "tool_call_id": "tc_1",
            },
        ],
    )

    result = list_responses(test_database, "conv1")
    assert len(result) == 1
    assert result[0].prompt == "What time is it?"
    assert "Tool call: llm_time({})" in result[0].response
    assert '{"time": "15:40"}' in result[0].response
    assert "The current time is 3:40 PM UTC." in result[0].response
    assert result[0].duration_ms == 300
    assert result[0].input_tokens == 30
    assert result[0].output_tokens == 15


def test_list_responses_merges_multi_step_tool_chain(test_database: sqlite_utils.Database) -> None:
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "r1",
                "model": "gpt-4",
                "prompt": "Complex task",
                "system": None,
                "response": "Let me check",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": 10,
                "output_tokens": 5,
            },
            {
                "id": "r2",
                "model": "gpt-4",
                "prompt": "",
                "system": None,
                "response": "Now checking more",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:01",
                "duration_ms": 200,
                "input_tokens": 20,
                "output_tokens": 10,
            },
            {
                "id": "r3",
                "model": "gpt-4",
                "prompt": "",
                "system": None,
                "response": "Final answer.",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:02",
                "duration_ms": 150,
                "input_tokens": 15,
                "output_tokens": 8,
            },
        ],
    )
    insert_tool_calls(
        test_database,
        [
            {
                "id": 1,
                "response_id": "r1",
                "tool_id": 1,
                "name": "tool_a",
                "arguments": '{"x": 1}',
                "tool_call_id": "tc_a",
            },
            {
                "id": 2,
                "response_id": "r2",
                "tool_id": 2,
                "name": "tool_b",
                "arguments": '{"y": 2}',
                "tool_call_id": "tc_b",
            },
        ],
    )
    insert_tool_results(
        test_database,
        [
            {
                "id": 1,
                "response_id": "r2",
                "tool_id": 1,
                "name": "tool_a",
                "output": "result_a",
                "tool_call_id": "tc_a",
            },
            {
                "id": 2,
                "response_id": "r3",
                "tool_id": 2,
                "name": "tool_b",
                "output": "result_b",
                "tool_call_id": "tc_b",
            },
        ],
    )

    result = list_responses(test_database, "conv1")
    assert len(result) == 1
    assert result[0].prompt == "Complex task"
    # Verify all tool calls and results are present in order
    response_text = result[0].response
    assert "Let me check" in response_text
    assert "Tool call: tool_a" in response_text
    assert "result_a" in response_text
    assert "Now checking more" in response_text
    assert "Tool call: tool_b" in response_text
    assert "result_b" in response_text
    assert "Final answer." in response_text
    # Verify ordering: tool_a block before tool_b block before final answer
    assert response_text.index("tool_a") < response_text.index("tool_b")
    assert response_text.index("tool_b") < response_text.index("Final answer.")
    # Verify aggregated tokens
    assert result[0].duration_ms == 450
    assert result[0].input_tokens == 45
    assert result[0].output_tokens == 23


def test_list_responses_no_merge_without_tool_calls(test_database: sqlite_utils.Database) -> None:
    """Regular conversations without tools remain unchanged."""
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "r1",
                "model": "gpt-4",
                "prompt": "Hello",
                "system": None,
                "response": "Hi!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": 5,
                "output_tokens": 3,
            },
            {
                "id": "r2",
                "model": "gpt-4",
                "prompt": "How are you?",
                "system": None,
                "response": "Fine!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:01:00",
                "duration_ms": 80,
                "input_tokens": 8,
                "output_tokens": 2,
            },
        ],
    )

    result = list_responses(test_database, "conv1")
    assert len(result) == 2
    assert result[0].response == "Hi!"
    assert result[1].response == "Fine!"


def test_list_responses_promptless_response_not_merged_without_tool_calls(
    test_database: sqlite_utils.Database,
) -> None:
    """A promptless response following a turn with no tool calls stays separate."""
    insert_conversations(test_database, [{"id": "conv1", "name": "Test", "model": "gpt-4"}])
    insert_responses(
        test_database,
        [
            {
                "id": "r1",
                "model": "gpt-4",
                "prompt": "Hello",
                "system": None,
                "response": "Hi there!",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:00",
                "duration_ms": 100,
                "input_tokens": 5,
                "output_tokens": 3,
            },
            {
                "id": "r2",
                "model": "gpt-4",
                "prompt": "",
                "system": None,
                "response": "Injected message",
                "conversation_id": "conv1",
                "datetime_utc": "2025-01-01T00:00:01",
                "duration_ms": 50,
                "input_tokens": 2,
                "output_tokens": 4,
            },
        ],
    )

    result = list_responses(test_database, "conv1")
    assert len(result) == 2
    assert result[0].prompt == "Hello"
    assert result[0].response == "Hi there!"
    assert result[1].prompt == ""
    assert result[1].response == "Injected message"
