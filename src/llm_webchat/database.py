import sqlite3

import sqlite_utils
from llm.cli import logs_db_path
from llm.migrations import migrate
from llm.utils import monotonic_ulid

from llm_webchat.config import Config
from llm_webchat.config import load_config
from llm_webchat.models import Conversation
from llm_webchat.models import ResponseItem
from llm_webchat.models import ToolCallItem
from llm_webchat.models import ToolResultItem


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

    allowed_ids = config.llm_webchat_conversation_ids
    has_responses_table = "responses" in database.table_names()

    if has_responses_table:
        latest_response_column = (
            "(SELECT MAX(r.datetime_utc) FROM responses r WHERE r.conversation_id = c.id)"
            " AS latest_response_datetime_utc"
        )
    else:
        latest_response_column = "NULL AS latest_response_datetime_utc"

    params: list[str | int] = []
    where_clause = ""
    if allowed_ids is not None:
        placeholders = ",".join("?" for _ in allowed_ids)
        where_clause = f" WHERE c.id IN ({placeholders})"
        params.extend(allowed_ids)
    params.append(count)

    rows = database.execute(
        f"SELECT c.id, c.name, c.model, {latest_response_column}"
        f" FROM conversations c{where_clause} ORDER BY c.rowid DESC LIMIT ?",
        params,
    ).fetchall()

    return [
        Conversation(
            id=row["id"],
            name=row["name"] or "",
            model=row["model"] or "",
            latest_response_datetime_utc=row["latest_response_datetime_utc"],
        )
        for row in rows
    ]


def create_conversation(database: sqlite_utils.Database, name: str, model: str) -> Conversation:
    conversation_id = str(monotonic_ulid()).lower()
    database.execute(
        "INSERT INTO conversations (id, name, model) VALUES (?, ?, ?)",
        [conversation_id, name, model],
    )
    database.conn.commit()
    return Conversation(id=conversation_id, name=name, model=model)


def conversation_exists(database: sqlite_utils.Database, conversation_id: str) -> bool:
    if "conversations" not in database.table_names():
        return False
    row = database.execute(
        "SELECT 1 FROM conversations WHERE id = ? LIMIT 1",
        [conversation_id],
    ).fetchone()
    return row is not None


def _fetch_tool_calls_by_response(
    database: sqlite_utils.Database, response_ids: list[str]
) -> dict[str, list[ToolCallItem]]:
    if not response_ids or "tool_calls" not in database.table_names():
        return {}

    placeholders = ",".join("?" for _ in response_ids)
    rows = database.execute(
        f"SELECT response_id, name, arguments, tool_call_id FROM tool_calls"
        f" WHERE response_id IN ({placeholders}) ORDER BY id ASC",
        response_ids,
    ).fetchall()

    result: dict[str, list[ToolCallItem]] = {}
    for row in rows:
        result.setdefault(row["response_id"], []).append(
            ToolCallItem(
                name=row["name"],
                arguments=row["arguments"] or "",
                tool_call_id=row["tool_call_id"] or "",
            )
        )
    return result


def _fetch_tool_results_by_response(
    database: sqlite_utils.Database, response_ids: list[str]
) -> dict[str, list[ToolResultItem]]:
    if not response_ids or "tool_results" not in database.table_names():
        return {}

    placeholders = ",".join("?" for _ in response_ids)
    rows = database.execute(
        f"SELECT response_id, name, output, tool_call_id FROM tool_results"
        f" WHERE response_id IN ({placeholders}) ORDER BY id ASC",
        response_ids,
    ).fetchall()

    result: dict[str, list[ToolResultItem]] = {}
    for row in rows:
        result.setdefault(row["response_id"], []).append(
            ToolResultItem(
                name=row["name"],
                output=row["output"] or "",
                tool_call_id=row["tool_call_id"] or "",
            )
        )
    return result


def _format_tool_call_block(call: ToolCallItem, result: ToolResultItem | None) -> str:
    lines = [f"Tool call: {call.name}({call.arguments})"]
    if result is not None:
        for output_line in result.output.splitlines():
            lines.append(f"  {output_line}")
    return "\n".join(lines)


def _build_merged_response_text(
    chain: list[sqlite3.Row],
    tool_calls_by_response: dict[str, list[ToolCallItem]],
    tool_results_by_response: dict[str, list[ToolResultItem]],
) -> str:
    # Build a lookup from tool_call_id to its result across all responses
    # in the chain.
    result_by_call_id: dict[str, ToolResultItem] = {}
    for row in chain:
        for tool_result in tool_results_by_response.get(row["id"], []):
            if tool_result.tool_call_id:
                result_by_call_id[tool_result.tool_call_id] = tool_result

    parts: list[str] = []
    for row in chain:
        response_text = (row["response"] or "").strip()
        calls = tool_calls_by_response.get(row["id"], [])

        # Within a single response: text comes before tool calls (the
        # common pattern for both Anthropic and OpenAI).
        if response_text:
            parts.append(response_text)

        if calls:
            call_lines = []
            for call in calls:
                matched_result = result_by_call_id.get(call.tool_call_id)
                call_lines.append(_format_tool_call_block(call, matched_result))
            parts.append("```\n" + "\n".join(call_lines) + "\n```")

    return "\n\n".join(parts)


def list_responses(database: sqlite_utils.Database, conversation_id: str) -> list[ResponseItem]:
    if "responses" not in database.table_names():
        return []

    rows = database.execute(
        "SELECT id, model, prompt, system, response, conversation_id, datetime_utc,"
        " duration_ms, input_tokens, output_tokens"
        " FROM responses WHERE conversation_id = ? ORDER BY datetime_utc ASC",
        [conversation_id],
    ).fetchall()

    response_ids = [row["id"] for row in rows]
    tool_calls_by_response = _fetch_tool_calls_by_response(database, response_ids)
    tool_results_by_response = _fetch_tool_results_by_response(database, response_ids)

    def _turn_has_tool_calls(turn: list[sqlite3.Row]) -> bool:
        return any(row["id"] in tool_calls_by_response for row in turn)

    # Group consecutive responses into "turns". A turn starts with a
    # response that has a non-empty prompt (user message). A promptless
    # response is appended to the preceding turn only when that turn
    # contains tool calls (indicating a tool-use chain). Otherwise it
    # starts its own turn (e.g. out-of-band injected responses).
    turns: list[list[sqlite3.Row]] = []
    for row in rows:
        prompt = row["prompt"]
        if prompt is not None and prompt.strip():
            turns.append([row])
        elif turns and _turn_has_tool_calls(turns[-1]):
            turns[-1].append(row)
        else:
            turns.append([row])

    merged: list[ResponseItem] = []
    for turn in turns:
        first_row = turn[0]

        if _turn_has_tool_calls(turn):
            combined_text = _build_merged_response_text(turn, tool_calls_by_response, tool_results_by_response)
        else:
            combined_text = first_row["response"] or ""

        last_row = turn[-1]
        total_duration = sum(r["duration_ms"] for r in turn if r["duration_ms"] is not None) or None
        total_input_tokens = sum(r["input_tokens"] for r in turn if r["input_tokens"] is not None) or None
        total_output_tokens = sum(r["output_tokens"] for r in turn if r["output_tokens"] is not None) or None

        merged.append(
            ResponseItem(
                id=first_row["id"],
                model=first_row["model"] or "",
                prompt=first_row["prompt"],
                system=first_row["system"],
                response=combined_text,
                conversation_id=first_row["conversation_id"],
                datetime_utc=last_row["datetime_utc"] or "",
                duration_ms=total_duration,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
            )
        )

    return merged
