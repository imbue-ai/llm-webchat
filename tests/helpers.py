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
