import sqlite3

import sqlite_utils
from llm.cli import logs_db_path
from llm.migrations import migrate
from llm.utils import monotonic_ulid

from llm_webchat.config import Config
from llm_webchat.config import load_config
from llm_webchat.models import Conversation
from llm_webchat.models import ResponseItem


def open_database() -> sqlite_utils.Database:
    path = logs_db_path()
    connection = sqlite3.connect(str(path), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    database = sqlite_utils.Database(connection)
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
            id=row["id"],
            name=row["name"] or "",
            model=row["model"] or "",
        )
        for row in rows
    ]


DEFAULT_MODEL = "anthropic/claude-opus-4-6"


def create_conversation(database: sqlite_utils.Database, name: str) -> Conversation:
    conversation_id = str(monotonic_ulid()).lower()
    database.execute(
        "INSERT INTO conversations (id, name, model) VALUES (?, ?, ?)",
        [conversation_id, name, DEFAULT_MODEL],
    )
    database.conn.commit()
    return Conversation(id=conversation_id, name=name, model=DEFAULT_MODEL)


def conversation_exists(database: sqlite_utils.Database, conversation_id: str) -> bool:
    if "conversations" not in database.table_names():
        return False
    row = database.execute(
        "SELECT 1 FROM conversations WHERE id = ? LIMIT 1",
        [conversation_id],
    ).fetchone()
    return row is not None


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
            id=row["id"],
            model=row["model"] or "",
            prompt=row["prompt"],
            system=row["system"],
            response=row["response"] or "",
            conversation_id=row["conversation_id"],
            datetime_utc=row["datetime_utc"] or "",
            duration_ms=row["duration_ms"],
            input_tokens=row["input_tokens"],
            output_tokens=row["output_tokens"],
        )
        for row in rows
    ]
