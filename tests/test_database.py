import pytest
import sqlite_utils

from llm_webchat.database import list_conversations
from llm_webchat.models import Conversation
from tests.helpers import insert_conversations


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
    monkeypatch.setenv("LLM_CONVERSATION_IDS", "abc,ghi")
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
