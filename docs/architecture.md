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

### Backend plugins

The backend can be extended using [pluggy](https://github.com/pytest-dev/pluggy) by providing implementations of the following hookspecs (defined in `llm_webchat.hookspecs`):

- `endpoint(app)` — Register additional endpoints.
- `register_event_broadcaster(broadcaster)` — Receive a reference to the event broadcaster. It can be used to inject custom events into conversatoin SSE streams.


### Styles

The main theme definition in the [css file](../frontend/src/style.css)
uses variables that can be overridden. All the components on the
page have typically semantic CSS class names (`message-list`,
`footer`, ...) for easier customization.

Use the `LLM_WEBCHAT_STATIC_PATHS` environment variable to serve
your custom css and `LLM_WEBCHAT_JAVASCRIPT_PLUGINS` to inject
a simple javascript loader for your css into the page.

See the [style override](../extension_examples/cyberpunk_style_override/) example for more details.


### Frontend plugins

Plugins can run arbitrary javascript making arbitrary changes to the page. To make this easier, the default DOM contains certain stable
elements / containers called "slots" which plugins can use as anchor points:

- `<div data-slot="header">` - the top header bar
- `<div data-slot="header-actions">` - empty container inside the header (for buttons, indicators)
- `<div data-slot="sidebar">` - the full sidebar
- `<div data-slot="sidebar-header">` — the sidebar title, collapse button, and "New Conversation" button
- `<div data-slot="sidebar-before-list">` - empty container between the sidebar header and the conversation list (for search, filters)
- `<div data-slot="conversation-selector-item">` - an individual conversation entry in the sidebar
- `<div data-slot="conversation-after-header">` - empty container below the header, above the message list (for banners, breadcrumbs)
- `<div data-slot="conversation-content">` - the scrollable message list area
- `<div data-slot="conversation-before-input">` - empty container inside the footer, above the message input (for toolbars, attachments)
- `<div data-slot="conversation-footer">` - the footer containing the message input
- `<div data-slot="new-conversation-content">` - the new conversation form area
- `<div data-slot="new-conversation-footer">` - the footer on the new conversation screen
- `<div data-slot="message" data-message-id="...">` - an individual assistant message

Slots marked "empty" in the list above render as empty `<div>` elements by default and exist purely as extension points — plugins can inject content without replacing any built-in UI.

There's a global `$llm` object that can be used to:

- Claim ownership of a specific slot:
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
    - `$llm.on("get_conversations")` - when a response to `GET /api/conversations` arrives (similarly below)
    - `$llm.on("get_conversation")`
    - `$llm.on("post_conversation")`
    - `$llm.on("post_conversation_message")`
    - `$llm.on("get_message")`
    - `$llm.on("stream_event")`

The registered `on` callbacks can be typically used both to
react to an event or to change the data on the fly (e.g.
to augment the sent data).


### Examples

The [extension_examples](../extension_examples) directory contains several examples that make use of the above mechanisms:

- [cyberpunk_style_override](): a simple restyling of the UI
- [custom_notifications](): frontend notifications in response to custom events
- [markdown_export_with_react](): adds a markdown export button to conversations; uses React under the hood
- [conversation_search](): introduces a new endpoint for conversation search and exposes it on the frontend using vanilla JS
