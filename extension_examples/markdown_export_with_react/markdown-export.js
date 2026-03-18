/**
 * markdown-export plugin
 *
 * Renders a small React component into the header that provides a
 * "⬇ Export" button. Clicking it fetches all responses for the current
 * conversation from the REST API, assembles them into a Markdown file,
 * and triggers a browser download.
 */

/* global $llm, React, ReactDOM */

window.addEventListener("load", function () {
"use strict";

// ── Helpers ──────────────────────────────────────────────────────

function currentConversationId() {
  const match = window.location.pathname.match(/\/conversations\/([^/]+)/);
  return match ? match[1] : null;
}

function buildMarkdown(conversation, responses) {
  const lines = [];

  lines.push(`# ${conversation.name}`);
  lines.push("");
  lines.push(`**Model:** ${conversation.model}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const response of responses) {
    if (response.prompt) {
      lines.push("## 🧑 User");
      lines.push("");
      lines.push(response.prompt);
      lines.push("");
    }

    lines.push("## 🤖 Assistant");
    if (response.model) {
      lines.push("");
      lines.push(`*Model: ${response.model}*`);
    }
    lines.push("");
    lines.push(response.response);
    lines.push("");

    if (response.datetime_utc) {
      lines.push(
        `<sub>${response.datetime_utc}` +
          (response.duration_ms != null
            ? ` · ${(response.duration_ms / 1000).toFixed(1)}s`
            : "") +
          (response.input_tokens != null
            ? ` · ${response.input_tokens} in / ${response.output_tokens} out`
            : "") +
          `</sub>`
      );
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
}

// ── React component ──────────────────────────────────────────────

// React is loaded at runtime from CDN, so we access it lazily via helpers.
function h(...args) { return React.createElement(...args); }
function useState(...args) { return React.useState(...args); }
function useCallback(...args) { return React.useCallback(...args); }

const BUTTON_STYLES = {
  idle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.35rem 0.75rem",
    fontSize: "0.8rem",
    fontWeight: 500,
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    background: "var(--color-surface)",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    transition: "all 150ms",
    fontFamily: "inherit",
  },
  busy: {
    opacity: 0.6,
    cursor: "wait",
  },
  done: {
    borderColor: "#22c55e",
    color: "#22c55e",
  },
  error: {
    borderColor: "#ef4444",
    color: "#ef4444",
  },
};

function ExportButton() {
  // "idle" | "busy" | "done" | "error"
  const [status, setStatus] = useState("idle");

  const handleClick = useCallback(async () => {
    const conversationId = currentConversationId();
    if (!conversationId || status === "busy") return;

    setStatus("busy");

    try {
      const conversation = $llm.getConversation(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found in local state");
      }

      const apiResponse = await fetch(
        `/api/conversations/${conversationId}/responses`
      );
      if (!apiResponse.ok) {
        throw new Error(`API responded with ${apiResponse.status}`);
      }
      const { responses } = await apiResponse.json();

      const markdown = buildMarkdown(conversation, responses);
      const filename = `${sanitizeFilename(conversation.name)}.md`;
      downloadFile(filename, markdown);

      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (error) {
      console.error("[markdown-export]", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [status]);

  const conversationId = currentConversationId();
  if (!conversationId) return null;

  const label =
    status === "busy"
      ? "⏳ Exporting…"
      : status === "done"
        ? "✓ Saved"
        : status === "error"
          ? "✗ Failed"
          : "⬇ Export";

  const style = {
    ...BUTTON_STYLES.idle,
    ...(status !== "idle" ? BUTTON_STYLES[status] : {}),
  };

  return h(
    "button",
    {
      className: "markdown-export-button",
      onClick: handleClick,
      disabled: status === "busy",
      title: "Download conversation as Markdown",
      style,
    },
    label
  );
}

// ── Bootstrap ────────────────────────────────────────────────────

function loadReact(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function bootstrap() {
  // Load React from CDN (skip if already present)
  if (!window.React) {
    await loadReact(
      "https://unpkg.com/react@18/umd/react.production.min.js"
    );
    await loadReact(
      "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
    );
  }

  // Create a container inside the header slot
  const header = document.querySelector('[data-slot="header"]');
  if (!header) {
    console.warn("[markdown-export] header slot not found");
    return;
  }

  // Make the header a flex row so the button sits on the right
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";

  const container = document.createElement("div");
  container.className = "markdown-export-container";
  header.appendChild(container);

  const root = ReactDOM.createRoot(container);

  // Re-render on navigation so the button appears/disappears correctly
  function render() {
    root.render(h(ExportButton));
  }

  render();

  // Re-render when conversations change or streams complete
  $llm.on("get_conversations", (data) => {
    render();
    return data;
  });
  $llm.on("get_conversation", (data) => {
    render();
    return data;
  });

  // Also watch for hash/route changes via popstate
  window.addEventListener("popstate", () => setTimeout(render, 50));

  // Observe route changes driven by mithril (pushState)
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    setTimeout(render, 50);
  };
}

bootstrap().catch((error) =>
  console.error("[markdown-export] bootstrap failed:", error)
);

}); // end window "load"
