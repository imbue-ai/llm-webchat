# LLM Webchat

A plugin for the [LLM](https://github.com/simonw/llm) tool.
When installed, running `llm webchat` starts a local webserver.
Visiting its address in the browser lets you see the
conversations in your `llm` database and chat with supported
language models.

The appearance and functionality of `llm-webchat` is heavily
customizable - styles, frontend appearance and behavior and even
the backend logic.

## Quickstart

```bash
llm install llm-webchat
llm webchat
```

## Development

### Prerequisites

- Python 3.10+ with [uv](https://github.com/astral-sh/uv)
- Node.js 18+

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
