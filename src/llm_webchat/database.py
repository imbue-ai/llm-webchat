import sqlite3

import sqlite_utils
from llm.cli import logs_db_path
from llm.migrations import migrate

from llm_webchat.config import Config
from llm_webchat.config import load_config
from llm_webchat.models import Conversation
from llm_webchat.models import ResponseItem


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


def list_responses(database: sqlite_utils.Database, conversation_id: str) -> list[ResponseItem]:
    if "responses" not in database.table_names():
        return []

    rows = database.execute(
        "SELECT id, model, prompt, system, response, conversation_id, datetime_utc,"
        " duration_ms, input_tokens, output_tokens"
        " FROM responses WHERE conversation_id = ? ORDER BY datetime_utc ASC",
        [conversation_id],
    ).fetchall()

    return [
        ResponseItem(
            id=row[0],
            model=row[1] or "",
            prompt=row[2],
            system=row[3],
            response=row[4] or "",
            conversation_id=row[5],
            datetime_utc=row[6] or "",
            duration_ms=row[7],
            input_tokens=row[8],
            output_tokens=row[9],
        )
        for row in rows
    ]
