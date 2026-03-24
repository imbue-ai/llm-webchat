from typing import Any

import sqlite_utils


def insert_conversations(database: sqlite_utils.Database, conversations: list[dict[str, Any]]) -> None:
    if "conversations" not in database.table_names():
        database["conversations"].create(
            {"id": str, "name": str, "model": str},
            pk="id",
        )
    for conversation in conversations:
        database["conversations"].insert(conversation)


def insert_responses(database: sqlite_utils.Database, responses: list[dict[str, Any]]) -> None:
    if "responses" not in database.table_names():
        database["responses"].create(
            {
                "id": str,
                "model": str,
                "prompt": str,
                "system": str,
                "prompt_json": str,
                "options_json": str,
                "response": str,
                "response_json": str,
                "conversation_id": str,
                "duration_ms": int,
                "datetime_utc": str,
                "input_tokens": int,
                "output_tokens": int,
            },
            pk="id",
            foreign_keys=(("conversation_id", "conversations", "id"),),
        )
    for response in responses:
        database["responses"].insert(response)


def insert_tool_calls(database: sqlite_utils.Database, tool_calls: list[dict[str, Any]]) -> None:
    if "tool_calls" not in database.table_names():
        database["tool_calls"].create(
            {
                "id": int,
                "response_id": str,
                "tool_id": int,
                "name": str,
                "arguments": str,
                "tool_call_id": str,
            },
            pk="id",
        )
    for tool_call in tool_calls:
        database["tool_calls"].insert(tool_call)


def insert_tool_results(database: sqlite_utils.Database, tool_results: list[dict[str, Any]]) -> None:
    if "tool_results" not in database.table_names():
        database["tool_results"].create(
            {
                "id": int,
                "response_id": str,
                "tool_id": int,
                "name": str,
                "output": str,
                "tool_call_id": str,
            },
            pk="id",
        )
    for tool_result in tool_results:
        database["tool_results"].insert(tool_result)
