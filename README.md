# llm-webchat

**(This is currently work in progress.)**

`llm-webchat` is a plugin for the [llm](https://github.com/simonw/llm) tool.
When installed, running `llm webchat` should open a browser
window where people can lead conversations with LLMs.

The appearance and functionality of `llm-webchat` is also heavily customizable. Read further for details.

## Quickstart

```bash
llm install llm-webchat
llm webchat
```

## Architecture

There is a backend in Python and a frontend written in Typescript. The
PyPI package contains compiled static frontend assets so users
don't need to have node or typescript installed at all.

### Backend

Backend uses fastapi + uvicorn. It provides the following endpoints:

- GET "/api/conversations" to list the most recent conversations
    - accepts the `?count=` parameter, by default `count=8`.
- GET "/api/conversations/:id to get a conversation, including its message history
- POST "/api/conversations/ to create a conversation
- POST "/api/conversations/:id/message to send a new user message to the conversation.
- GET /api/conversations/:id/stream get a stream of events in
a given conversation. There are several kinds of events:
    - `message`: a newly inserted message (typically injected from the outside)
    - `message_start`, `message_delta`, `message_end`: to stream the current LLM response
    - `error`: to provide details about potential errors

Static files are served from `/static`. The only exception is `index.html` which is served from the root.


The following environment variables are recognized:

- `LLM_DB_PATH`: Path to llm's sqlite database. If not provided, the output of `llm logs path` is used instead.
- `LLM_CONVERSATION_IDS`: a comma-separated list. If provided, only these conversations are ever returned.
- `LLM_WEBCHAT_JAVASCRIPT_PLUGINS`: a comma separated list of .js files containing frontend plugins (see below).
- `LLM_WEBCHAT_STATIC_PATHS`: a comma separated list of additional paths to resources that should be served from under `/static`. Files and directories are both accepted.

The web server can be extended using [pluggy](https://github.com/pytest-dev/pluggy) by providing implementation to the:

- `llm_webchat.endpoint` hookspec to add more endpoints
- `llm_webchat.static_paths` hookspec to add additional default static paths.


### Frontend

Frontend is written in Typescript, using mithril.js and
tailwind. Its appearance and functionality should be familiar to
users of other well-known chat-based web AI assistants.

Both the appearance and functionality are highly customizable
using a framework-agnostic plugin system. Plugins can run
arbitrary javascript making arbitrary changes to the page. To
make this easier, the default DOM will contain certain stable
elements / containers with well data attributes which plugins
can use as anchor points:

- `<div data-slot="header">`
- `<div data-slot="sidebar">`
- `<div data-slot="content">`
- `<div data-slot="footer">`
- `<div data-slot="message" data-message-id="...">`
- `<div data-slot="conversation-selector">`
- `<div data-slot="conversation-detail" data-conversation-id="...">`

Furthermore, there's a global "$llm" object that can be used to:

- Claim ownership of a specific component type:
    - `llm.claim("header")` (or `"sidebar"`, `"content"`, `"message"`, ...)
    - When claimed, only the component container is rendered by the core loop (contents are expected to be provided by the plugin).
    - Returns true when the claim succeeded, false otherwise (e.g. when already claimed by another plugin).
    - (This is to prevent conflicts between the renders done by the core mithril.js loop and the renders done by the plugin.)
- Get specific parts of the current page state:
    - `$llm.getMessage(messageId)`
    - `$llm.getConversations()`
    - `$llm.getConversation(conversationId)`
- Register for certain events:
    - `$llm.on("ready")` - when the main APP is initialized
    - `$llm.on("get_conversations")` - when a response to `GET /api/conversations` arrives.
    - `$llm.on("get_conversation")`
    - `$llm.on("post_conversation")`
    - `$llm.on("get_message")`
    - `$llm.on("stream_event")`
