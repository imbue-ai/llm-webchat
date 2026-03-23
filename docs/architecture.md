# LLM Webchat architecture

Webchat is built using two components:

- a Python backend
- a Typescript frontend

The distributed Python package contains compiled static frontend assets so users
don't need to have node or Typescript installed at all.

## Backend

The backend uses [fastapi](https://fastapi.tiangolo.com/) and [uvicorn](https://uvicorn.dev/).
It provides endpoints to list and create conversations, list
existing responses, send user messages and stream LLM responses
and other events in real time. There are also endpoints to serve
static files.

Static files are served from `/assets` with the exception of:

- `index.html` and `favicon.ico` which are served from
the root
- plugin-supplied asset files which are served from `/plugins`


The following optional environment variables are recognized:

- `LLM_WEBCHAT_CONVERSATION_IDS`: a comma-separated whitelist of conversations.
- `LLM_WEBCHAT_JAVASCRIPT_PLUGINS`: a comma-separated list of .js files containing frontend plugins (see the [extension docs](./extensions.md) for more details).
- `LLM_WEBCHAT_STATIC_PATHS`: a comma-separated list of additional file paths that should be served from `/plugins`.
- `LLM_WEBCHAT_HOST`: the host address the server binds to. Defaults to `127.0.0.1`.
- `LLM_WEBCHAT_PORT`: the port the server listens on. Defaults to `8000`.
- `LLM_WEBCHAT_TOOL_CHAIN_LIMIT`: maximum number of chained tool responses allowed per message. Defaults to `20`. Set to `0` for unlimited.

## Frontend

The frontend is written in Typescript, using [mithril.js](https://mithril.js.org/) and [Tailwind](https://tailwindcss.com/).

Both appearance and functionality are highly customizable using a flexible and framework-agnostic plugin system.


## Extending LLM Webchat

See the [extension docs](./extensions.md) for details.
