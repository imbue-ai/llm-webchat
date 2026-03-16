from __future__ import annotations

import click
import llm

from llm_webchat.config import load_config
from llm_webchat.server import create_application


@llm.hookimpl
def register_commands(cli: click.Group) -> None:
    @cli.command()
    def webchat() -> None:
        """Open a web chat interface for conversations with LLMs."""
        import uvicorn

        config = load_config()
        application = create_application()
        uvicorn.run(application, host=config.llm_webchat_host, port=config.llm_webchat_port)
