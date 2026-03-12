from __future__ import annotations

import click
import llm

from llm_webchat.server import create_application


@llm.hookimpl
def register_commands(cli: click.Group) -> None:
    @cli.command()
    def webchat() -> None:
        """Open a web chat interface for conversations with LLMs."""
        import uvicorn

        application = create_application()
        uvicorn.run(application, host="127.0.0.1", port=8000)
