![LLM Webchat logo](https://github.com/user-attachments/assets/40c27a0c-5431-48c4-a2c1-9daafc2c8bd7)

# LLM Webchat

[![PyPI](https://img.shields.io/pypi/v/llm-webchat)](https://pypi.org/project/llm-webchat/)
[![Tests](https://img.shields.io/github/actions/workflow/status/imbue-ai/llm-webchat/ci.yml?label=tests)](https://github.com/imbue-ai/llm-webchat/actions)
[![License](https://img.shields.io/github/license/imbue-ai/llm-webchat)](LICENSE)

A plugin for the [LLM](https://github.com/simonw/llm) tool.
When installed, running `llm webchat` starts a local webserver.
Visiting its address in the browser lets you see conversations
in your `llm` database and chat with supported language models.

The appearance and functionality of `llm-webchat` are heavily
customizable: styles, frontend behavior and even the backend
logic.

For more details, see the [high-level architecture docs](./docs/architecture.md) or the [extension docs](./docs/extensions.md).

## Quickstart

```bash
llm install llm-webchat
llm webchat
```

## Screenshot

![Screenshot of LLM Webchat in a browser](https://github.com/user-attachments/assets/482a9c33-362f-4896-bea4-7dfc4f5fab33)

## Configuration

LLM Webchat recognizes the following environment variables (all of which are optional):

- `LLM_WEBCHAT_CONVERSATION_IDS`: a comma-separated whitelist of conversations.
- `LLM_WEBCHAT_JAVASCRIPT_PLUGINS`: a comma-separated list of .js files containing frontend plugins (see the [extension docs](./docs/extensions.md) for more details).
- `LLM_WEBCHAT_STATIC_PATHS`: a comma-separated list of additional file paths that should be served from `/plugins`.
- `LLM_WEBCHAT_HOST`: the host address the server binds to. Defaults to `127.0.0.1`.
- `LLM_WEBCHAT_PORT`: the port the server listens on. Defaults to `8000`.
- `LLM_WEBCHAT_TOOL_CHAIN_LIMIT`: maximum number of chained tool responses allowed per message. Defaults to `20`. Set to `0` for unlimited.

## Development

### Prerequisites

- A reasonably recent version of Python with [uv](https://github.com/astral-sh/uv)
- A reasonably recent version of Node

### Building and running

Build the frontend (output goes to `src/llm_webchat/static/`):

```bash
cd frontend
npm install
npm run build
```

Run the backend (serves the built frontend at `/`):

```bash
uv run llm-webchat
```

For frontend development with hot reload (proxies `/api` requests to the backend):

```bash
cd frontend
npm run dev
```

### Running tests

```bash
uv run pytest
cd frontend
npm test
```
