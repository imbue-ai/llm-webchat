# Style override — cyberpunk theme

A single CSS file that completely restyles `llm-webchat` into a neon-drenched
cyberpunk interface.

It works purely through CSS: overriding the `@theme` custom properties and
targeting the semantic class names already present in the default DOM.

## Usage

From the repository root:

```bash
LLM_WEBCHAT_STATIC_PATHS=extension_examples/cyberpunk_style_override/cyberpunk.css \
  LLM_WEBCHAT_JAVASCRIPT_PLUGINS=extension_examples/cyberpunk_style_override/cyberpunk-loader.js \
  llm webchat
```
