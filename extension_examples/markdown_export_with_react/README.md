# Markdown export — React plugin example

A frontend-only plugin that adds an Export button to the header.
Clicking it downloads the current conversation as a Markdown file.

This example demonstrates:

- Rendering a React component into an existing `data-slot` anchor (`header`)
- Using the `$llm` plugin API (`getConversation()`, `on()`) and the REST API
  (`/api/conversations/:id/responses`) together

## Usage

From the repository root:

```bash
LLM_WEBCHAT_JAVASCRIPT_PLUGINS=extension_examples/markdown_export_with_react/markdown-export.js \
  llm webchat
```

Navigate to any conversation and click Export in the top-right corner
of the header. A `.md` file will be downloaded.
