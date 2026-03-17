from __future__ import annotations

import click
import llm
import uvicorn

from llm_webchat.config import load_config
from llm_webchat.server import create_application


def main() -> None:
    """Run the llm-webchat server."""
    config = load_config()
    application = create_application(config)
    uvicorn.run(application, host=config.llm_webchat_host, port=config.llm_webchat_port)


@llm.hookimpl
def register_commands(cli: click.Group) -> None:
    @cli.command()
    def webchat() -> None:
        """Open a web chat interface for conversations with LLMs."""
        main()
