# llm-webchat

See README.md for context and the vision for the project.

## Coding style guide

- Prefer functional, stateless logic as much as possible.
- Use immutable data structures as much as possible.
- Do not use abbreviations in variable (class, function, ...) names. It's fine for names to be somewhat verbose.
- Omit docstrings and comments if they don't add any value beyond what can be obviously inferred from the function signature / class name.
- Do not throw builtin errors; always replace them with dedicated error subclasses.
- Make sure to use up-to-date versions of all libraries.

### Python

- Use modern typed Python code (assume pyre check).
- Use uv for python project management.
- Use frozen pydantic models for most classes.
- Use pytest for testing.
- Always place imports at the top level.
- Avoid async code when possible; prefer synchronous implementations.
- When done, validate your changes by running `uv run pytest`.

### Typescript

- Use modern Typescript code.
- When done, validate your changes by running `npm lint` and `npm test`.
- Use async / await instead of raw Promise primitives where possible.

### CSS

- Add semantic class names to components make restyling easy.
- Make most important values part of `@theme` as variables that can be referenced by extension authors.
