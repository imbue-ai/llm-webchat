![LLM Webchat logo](https://github.com/user-attachments/assets/40c27a0c-5431-48c4-a2c1-9daafc2c8bd7)

# LLM Webchat

[![PyPI](https://img.shields.io/pypi/v/llm-webchat)](https://pypi.org/project/llm-webchat/)
[![Tests](https://img.shields.io/github/actions/workflow/status/OWNER/llm-webchat/ci.yml?label=tests)](https://github.com/OWNER/llm-webchat/actions)
[![License](https://img.shields.io/github/license/OWNER/llm-webchat)](LICENSE)

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
