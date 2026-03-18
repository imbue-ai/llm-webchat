# LLM Webchat architecture

There is a backend in Python and a frontend written in Typescript. The
PyPI package contains compiled static frontend assets so users
don't need to have node or typescript installed at all.

## Backend

Backend uses fastapi + uvicorn. It provides the following endpoints:

- GET "/api/models" to list all available LLM models
- GET "/api/conversations" to list the most recent conversations
    - accepts the `?count=` parameter, by default `count=10`.
- GET "/api/conversations/:id/responses to get all responses in a given conversation
- POST "/api/conversations/ to create a conversation (requires `name` and `model` in the request body)
- POST "/api/conversations/:id/ to send a new user message to an existing conversation (requires `message` and `model` in the request body).
- GET /api/conversations/:id/stream get a stream of events in
a given conversation. There are several kinds of events:
    - `user_message`: user message that arrived
    - `message_start`, `message_delta`, `message_end`: to stream the current LLM response
    - `error`: to provide details about potential errors

Static files are served from `/static`. The only exception is `index.html` which is served from the root.


The following environment variables are recognized:

- `LLM_WEBCHAT_CONVERSATION_IDS`: a comma-separated list. If provided, only these conversations are ever returned.
- `LLM_WEBCHAT_JAVASCRIPT_PLUGINS`: a comma separated list of .js files containing frontend plugins (see below).
- `LLM_WEBCHAT_STATIC_PATHS`: a comma separated list of additional paths to resources that should be served from under `/static`. Files and directories are both accepted.
- `LLM_WEBCHAT_HOST`: the host address the server binds to. Defaults to `127.0.0.1`.
- `LLM_WEBCHAT_PORT`: the port the server listens on. Defaults to `8000`.

The web server can be extended using [pluggy](https://github.com/pytest-dev/pluggy) by providing implementations of the following hookspecs (defined in `llm_webchat.hookspecs`):

- `endpoint(app)` — Register additional endpoints (including static file routes) on the FastAPI application.
- `register_event_broadcaster(broadcaster)` — Receive a reference to the event broadcaster callable. The broadcaster has the signature `(conversation_id: str, event: dict[str, str]) -> None` and can be stored and called at any time to inject custom events into the SSE stream for a given conversation.


## Frontend

Frontend is written in Typescript, using mithril.js and
tailwind. Its appearance and functionality should be familiar to
users of other well-known chat-based web AI assistants.

Both the appearance and functionality are highly customizable
using a framework-agnostic plugin system. Plugins can run
arbitrary javascript making arbitrary changes to the page. To
make this easier, the default DOM will contain certain stable
elements / containers with well data attributes which plugins
can use as anchor points:

- `<div data-slot="header">` — the top header bar
- `<div data-slot="header-actions">` — empty container inside the header, right-aligned (for buttons, indicators)
- `<div data-slot="sidebar">` — the full sidebar
- `<div data-slot="sidebar-header">` — the sidebar title, collapse button, and "New Conversation" button
- `<div data-slot="sidebar-before-list">` — empty container between the sidebar header and the conversation list (for search, filters)
- `<div data-slot="conversation-selector-item">` — an individual conversation entry in the sidebar
- `<div data-slot="conversation-after-header">` — empty container below the header, above the message list (for banners, breadcrumbs)
- `<div data-slot="conversation-content">` — the scrollable message list area
- `<div data-slot="conversation-before-input">` — empty container inside the footer, above the message input (for toolbars, attachments)
- `<div data-slot="conversation-footer">` — the footer containing the message input
- `<div data-slot="new-conversation-content">` — the new conversation form area
- `<div data-slot="new-conversation-footer">` — the footer on the new conversation screen
- `<div data-slot="message" data-message-id="...">` — an individual assistant message

Slots marked "empty" render as empty `<div>` elements by default and exist purely as extension points — plugins can claim them and inject content without replacing any built-in UI.

Furthermore, there's a global "$llm" object that can be used to:

- Claim ownership of a specific component type:
    - `$llm.claim("header")` (or `"sidebar"`, `"content"`, `"message"`, ...)
    - When claimed, only the component container is rendered by the core loop (contents are expected to be provided by the plugin).
    - Returns true when the claim succeeded, false otherwise (e.g. when already claimed by another plugin).
    - (This is to prevent conflicts between the renders done by the core mithril.js loop and the renders done by the plugin.)
- Get specific parts of the current page state:
    - `$llm.getMessage(messageId)`
    - `$llm.getConversations()`
    - `$llm.getConversation(conversationId)`
    - `$llm.getModels()`
- Register for certain events:
    - `$llm.on("ready")` - when the main APP is initialized
    - `$llm.on("get_conversations")` - when a response to `GET /api/conversations` arrives.
    - `$llm.on("get_conversation")`
    - `$llm.on("post_conversation")`
    - `$llm.on("post_conversation_message")`
    - `$llm.on("get_message")`
    - `$llm.on("stream_event")`
