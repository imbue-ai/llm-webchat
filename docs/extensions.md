# Extending LLM Webchat

## Backend plugins

The backend can be extended using [pluggy](https://github.com/pytest-dev/pluggy) by providing implementations of the following hookspecs (defined in `llm_webchat.hookspecs`):

- `endpoint(app)` — Register additional endpoints.
- `register_event_broadcaster(broadcaster)` — Receive a reference to the event broadcaster. It can be used to inject custom events into conversation SSE streams.


## Styles

The main theme definition in the [CSS file](../frontend/src/style.css)
uses variables that can be overridden. Components on the
page typically have semantic CSS class names (`message-list`,
`footer`, ...) for easier customization.

Use the `LLM_WEBCHAT_STATIC_PATHS` environment variable to serve
your custom CSS and `LLM_WEBCHAT_JAVASCRIPT_PLUGINS` to inject
a loader for your CSS into the page.

See the [style override](../extension_examples/cyberpunk_style_override/) example for more details.


## Frontend plugins

Plugins can run arbitrary JavaScript making arbitrary changes to the page. To make this easier, the page contains certain stable
elements / containers called "slots" which plugins can use as anchor points:

- `<div data-slot="header">` - the top header bar
- `<div data-slot="header-actions">` - empty container inside the header (for buttons, indicators)
- `<div data-slot="sidebar">` - the full sidebar
- `<div data-slot="sidebar-header">` - the sidebar title, collapse button, and "New Conversation" button
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
    - (This is to prevent conflicts between the renders done by the core mithril.js loop and the renders done by the plugins.)
- Get specific parts of the current page state:
    - `$llm.getMessage(messageId)`
    - `$llm.getConversations()`
    - `$llm.getConversation(conversationId)`
    - `$llm.getModels()`
- Register for events:
    - `$llm.on("ready")` - When the main app is initialized.
    - `$llm.on("get_conversations")` - When a response to `GET /api/conversations` arrives (similarly below).
    - `$llm.on("get_conversation")`
    - `$llm.on("post_conversation")`
    - `$llm.on("post_conversation_message")`
    - `$llm.on("get_message")`
    - `$llm.on("stream_event")`

The registered `on` callbacks can be typically used both to
react to an event and to change the data on the fly (e.g.
to augment what gets sent to the server).


## Examples

The [extension_examples](../extension_examples) directory contains several examples that make use of the above mechanisms:

- [cyberpunk_style_override](../extension_examples/cyberpunk_style_override): a simple restyling of the UI
- [custom_notifications](../extension_examples/custom_notifications): custom events triggering frontend notifications
- [markdown_export_with_react](../extension_examples/markdown_export_with_react): adds a markdown export button to conversations; uses React under the hood
- [conversation_search](../extension_examples/conversation_search): introduces a new endpoint for conversation search and exposes it on the frontend using vanilla JS
