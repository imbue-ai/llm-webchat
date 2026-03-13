import sqlite3

import sqlite_utils
from llm.cli import logs_db_path
from llm.migrations import migrate

from llm_webchat.config import Config
from llm_webchat.config import load_config
from llm_webchat.models import Conversation


def open_database() -> sqlite_utils.Database:
    path = logs_db_path()
    database = sqlite_utils.Database(sqlite3.connect(str(path), check_same_thread=False))
    migrate(database)
    return database


def list_conversations(
    database: sqlite_utils.Database, count: int = 10, config: Config | None = None
) -> list[Conversation]:
    if "conversations" not in database.table_names():
        return []

    if config is None:
        config = load_config()

    allowed_ids = config.llm_conversation_ids

    if allowed_ids is not None:
        placeholders = ",".join("?" for _ in allowed_ids)
        rows = database.execute(
            f"SELECT id, name, model FROM conversations WHERE id IN ({placeholders}) ORDER BY rowid DESC LIMIT ?",
            allowed_ids + [count],
        ).fetchall()
    else:
        rows = database.execute(
            "SELECT id, name, model FROM conversations ORDER BY rowid DESC LIMIT ?",
            [count],
        ).fetchall()

    return [
        Conversation(
            id=row[0],
            name=row[1] or "",
            model=row[2] or "",
        )
        for row in rows
    ]
