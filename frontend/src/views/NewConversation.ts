import m from "mithril";
import { isSlotClaimed } from "../slots";
import { createConversationAndSend } from "../models/Conversation";
import { startStreamingMessage } from "../models/StreamingMessage";
import { getDefaultModelId, persistSelectedModelId } from "../models/Model";
import { ModelSelector } from "./ModelSelector";
import { Spinner } from "./Spinner";

const MAX_TEXTAREA_HEIGHT_PX = 200;

let messageText = "";
let systemPromptText = "";
let systemPromptExpanded = false;
let creating = false;
let selectedModelId: string | null = null;

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
}

async function handleCreateConversation(): Promise<void> {
  const trimmedMessage = messageText.trim();
  const modelId = selectedModelId;
  if (!trimmedMessage || !modelId || creating) {
    return;
  }
  creating = true;
  m.redraw();

  try {
    const systemPrompt = systemPromptText;

    messageText = "";
    systemPromptText = "";
    systemPromptExpanded = false;

    const conversationId = await createConversationAndSend(trimmedMessage, modelId, systemPrompt);

    // Set streaming state BEFORE navigating so that when MessageList
    // first renders for this conversation, it sees an active streaming
    // message and skips the initial fetch (the data will be fetched
    // once streaming finalises).
    startStreamingMessage(conversationId, trimmedMessage, modelId);

    // Navigate to the conversation page. This schedules a mithril
    // redraw that will render MessageList and call connectToStream()
    // via App.view().
    m.route.set("/conversations/:conversationId", { conversationId });
  } finally {
    creating = false;
    m.redraw();
  }
}

function renderForm(): m.Vnode {
  if (selectedModelId === null) {
    selectedModelId = getDefaultModelId();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleCreateConversation();
    }
  }

  const hasMessageText = messageText.trim().length > 0;
  const sendButtonLabel = creating ? "Creating…" : "Send";

  return m("div", { class: "new-conversation flex items-center justify-center h-full" }, [
    m("div", { class: "new-conversation-form w-full max-w-(--width-message-column) flex flex-col gap-4" }, [
      m(
        "h2",
        { class: "new-conversation-title text-2xl font-semibold text-text-primary text-center" },
        "Start a new conversation",
      ),
      m("div", { class: "new-conversation-input flex items-center gap-3" }, [
        m(
          "div",
          {
            class:
              "new-conversation-input-box flex-1 flex flex-col rounded-lg border border-border bg-surface focus-within:border-primary transition-colors",
          },
          [
            m("textarea", {
              class:
                "new-conversation-textbox resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none w-full",
              style: { overflowY: "hidden" },
              placeholder: "Type a message…",
              rows: 1,
              value: messageText,
              disabled: creating,
              oncreate: (textareaVnode: m.VnodeDOM) => {
                autoResizeTextarea(textareaVnode.dom as HTMLTextAreaElement);
              },
              onupdate: (textareaVnode: m.VnodeDOM) => {
                autoResizeTextarea(textareaVnode.dom as HTMLTextAreaElement);
              },
              oninput: (event: Event) => {
                const textarea = event.target as HTMLTextAreaElement;
                messageText = textarea.value;
                autoResizeTextarea(textarea);
              },
              onkeydown: handleKeydown,
            }),
            m("div", { class: "new-conversation-toolbar flex justify-end px-3 pb-2" }, [
              m(ModelSelector, {
                selectedModelId,
                onSelect: (modelId: string) => {
                  selectedModelId = modelId;
                  persistSelectedModelId(modelId);
                },
              }),
            ]),
          ],
        ),
        m(
          "button",
          {
            class: [
              "new-conversation-send-button inline-flex w-36 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium text-white transition-colors",
              creating ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary-hover cursor-pointer",
            ].join(" "),
            disabled: creating || !hasMessageText,
            onclick: handleCreateConversation,
          },
          creating ? [m(Spinner), sendButtonLabel] : sendButtonLabel,
        ),
      ]),
      m("div", { class: "system-prompt-row flex gap-3 -mt-2" }, [
        m("div", { class: "system-prompt-section flex-1 flex flex-col gap-1" }, [
          m(
            "button",
            {
              class:
                "system-prompt-toggle text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer bg-transparent border-none p-0 self-start",
              onclick: () => {
                systemPromptExpanded = !systemPromptExpanded;
              },
            },
            [m("span", systemPromptExpanded ? "▾ " : "▸ "), "System prompt"],
          ),
          systemPromptExpanded
            ? m("textarea", {
                class:
                  "system-prompt-textbox w-full resize-none rounded-lg border border-border bg-surface px-4 pt-3 pb-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary transition-colors",
                style: { overflowY: "hidden" },
                placeholder: "Enter a system prompt (optional)…",
                rows: 2,
                value: systemPromptText,
                disabled: creating,
                oncreate: (textareaVnode: m.VnodeDOM) => {
                  autoResizeTextarea(textareaVnode.dom as HTMLTextAreaElement);
                },
                onupdate: (textareaVnode: m.VnodeDOM) => {
                  autoResizeTextarea(textareaVnode.dom as HTMLTextAreaElement);
                },
                oninput: (event: Event) => {
                  const textarea = event.target as HTMLTextAreaElement;
                  systemPromptText = textarea.value;
                  autoResizeTextarea(textarea);
                },
              })
            : null,
        ]),
        m(
          "div",
          {
            class: "new-conversation-send-button-spacer w-36 rounded-lg px-5 py-3 text-sm font-medium invisible",
          },
          "Send",
        ),
      ]),
    ]),
  ]);
}

export const NewConversation: m.Component = {
  view() {
    return m("div", { class: "app-content-wrapper flex-1 flex flex-col min-h-0" }, [
      m(
        "main",
        {
          class: "app-content flex-1 overflow-y-auto p-6",
          "data-slot": "new-conversation-content",
        },
        isSlotClaimed("new-conversation-content") ? null : renderForm(),
      ),
      m("footer", {
        class: "app-footer border-t border-border px-6 py-3",
        "data-slot": "new-conversation-footer",
      }),
    ]);
  },
};
