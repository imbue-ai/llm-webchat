# LLM Webchat architecture

The chat is built using two components:

- a Python backend
- a Typescript frontend

The distributed Python package contains compiled static frontend assets so users
don't need to have node or Typescript installed at all.

## Backend

Backend is built using fastapi + uvicorn. It provides endpoints
to list and create conversations, list existing responses, send
user messages and stream LLM responses and other events in real
time. There are also endpoints to serve static files.

Static files are served from `/assets` with the exception of:

- `index.html` and `favicon.ico` which are served from
the root
- plugin-supplied asset files which are served from `/plugins`


The following environment variables are recognized:

- `LLM_WEBCHAT_CONVERSATION_IDS`: a comma-separated list. If provided, only these conversations can be returned.
- `LLM_WEBCHAT_JAVASCRIPT_PLUGINS`: a comma separated list of .js files containing frontend plugins (see below for more details).
- `LLM_WEBCHAT_STATIC_PATHS`: a comma separated list of additional file paths that should be served from under `/plugins`.
- `LLM_WEBCHAT_HOST`: the host address the server binds to. Defaults to `127.0.0.1`.
- `LLM_WEBCHAT_PORT`: the port the server listens on. Defaults to `8000`.

## Frontend

Frontend is written in Typescript, using [mithril.js](https://mithril.js.org/) and [Tailwind](https://tailwindcss.com/).

Both the appearance and functionality are highly customizable using a flexible and framework-agnostic plugin system.


## Extending LLM Webchat

See the [extension docs](./extensions.md) for details.
