from __future__ import annotations

import os
from pathlib import Path

import click
import llm
import uvicorn
from fastapi import FastAPI
from fastapi import Query
from fastapi import Request
from fastapi.responses import JSONResponse

from llm_webchat.hookspecs import hookimpl

STATIC_DIRECTORY = Path(__file__).parent / "static"

SNIPPET_CONTEXT_LENGTH = 80


class SearchResult:
    def __init__(
        self,
        conversation_id: str,
        conversation_name: str,
        model: str,
        response_id: str,
        snippet: str,
        field: str,
    ) -> None:
        self.conversation_id = conversation_id
        self.conversation_name = conversation_name
        self.model = model
        self.response_id = response_id
        self.snippet = snippet
        self.field = field


def _extract_snippet(text: str, query: str, context_length: int = SNIPPET_CONTEXT_LENGTH) -> str:
    lower_text = text.lower()
    lower_query = query.lower()
    position = lower_text.find(lower_query)
    if position == -1:
        return text[: context_length * 2] + ("…" if len(text) > context_length * 2 else "")

    start = max(0, position - context_length)
    end = min(len(text), position + len(query) + context_length)

    snippet = text[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"

    return snippet


def _search_conversations(query: str, limit: int = 20) -> list[dict[str, str]]:
    from llm_webchat.database import open_database

    database = open_database()

    if "responses" not in database.table_names():
        return []
    if "conversations" not in database.table_names():
        return []

    like_pattern = f"%{query}%"

    rows = database.execute(
        """
        SELECT
            r.id AS response_id,
            r.conversation_id,
            r.prompt,
            r.response,
            c.name AS conversation_name,
            c.model
        FROM responses r
        JOIN conversations c ON c.id = r.conversation_id
        WHERE r.prompt LIKE ? COLLATE NOCASE
           OR r.response LIKE ? COLLATE NOCASE
        ORDER BY r.datetime_utc DESC
        LIMIT ?
        """,
        [like_pattern, like_pattern, limit],
    ).fetchall()

    results = []
    for row in rows:
        prompt = row["prompt"] or ""
        response = row["response"] or ""

        if query.lower() in prompt.lower():
            snippet = _extract_snippet(prompt, query)
            field = "prompt"
        else:
            snippet = _extract_snippet(response, query)
            field = "response"

        results.append(
            {
                "conversation_id": row["conversation_id"],
                "conversation_name": row["conversation_name"] or "",
                "model": row["model"] or "",
                "response_id": row["response_id"],
                "snippet": snippet,
                "field": field,
            }
        )

    return results


class SearchPlugin:
    @hookimpl
    def endpoint(self, app: FastAPI) -> None:
        @app.get("/api/search")
        def search_conversations(
            request: Request,
            q: str = Query(..., min_length=1),
            limit: int = Query(default=20, ge=1, le=100),
        ) -> JSONResponse:
            results = _search_conversations(q, limit)
            return JSONResponse(content={"query": q, "results": results})


@llm.hookimpl
def register_commands(cli: click.Group) -> None:
    @cli.command(name="webchat-with-search")
    def webchat_with_search() -> None:
        """Open a web chat interface with conversation search."""
        from llm_webchat.config import load_config
        from llm_webchat.plugins import get_plugin_manager
        from llm_webchat.server import create_application

        search_plugin = SearchPlugin()
        get_plugin_manager().register(search_plugin)

        javascript_plugin_path = str(STATIC_DIRECTORY / "search.js")
        existing_plugins = os.environ.get("LLM_WEBCHAT_JAVASCRIPT_PLUGINS", "")
        if existing_plugins:
            os.environ["LLM_WEBCHAT_JAVASCRIPT_PLUGINS"] = f"{existing_plugins},{javascript_plugin_path}"
        else:
            os.environ["LLM_WEBCHAT_JAVASCRIPT_PLUGINS"] = javascript_plugin_path

        config = load_config()
        application = create_application(config)
        uvicorn.run(application, host=config.llm_webchat_host, port=config.llm_webchat_port)
