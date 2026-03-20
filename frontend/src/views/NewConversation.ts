import m from "mithril";
import { isSlotClaimed } from "../slots";
import { createConversationAndSend } from "../models/Conversation";
import { startStreamingMessage } from "../models/StreamingMessage";
import { getDefaultModelId, persistSelectedModelId } from "../models/Model";
import { ModelSelector } from "./ModelSelector";

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

    startStreamingMessage(conversationId, trimmedMessage, modelId);

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

  return m("div", { class: "new-conversation flex items-center justify-center h-full" }, [
    m("div", { class: "new-conversation-form w-full max-w-(--width-message-column) flex flex-col gap-4 px-8" }, [
      m("h2", { class: "new-conversation-title text-2xl font-semibold text-center" }, "Start a new conversation"),
      m("div", { class: "new-conversation-input" }, [
        m("div", { class: "new-conversation-input-box flex flex-col" }, [
          m("textarea", {
            class:
              "new-conversation-textbox resize-none bg-transparent px-5 pt-4 pb-2 text-text-primary placeholder:text-text-faint focus:outline-none w-full",
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
          m("div", { class: "new-conversation-toolbar flex items-center justify-between px-4 pb-3 pt-1" }, [
            m("div", { class: "new-conversation-toolbar-left" }, [
              m(ModelSelector, {
                selectedModelId,
                onSelect: (modelId: string) => {
                  selectedModelId = modelId;
                  persistSelectedModelId(modelId);
                },
              }),
            ]),
            creating
              ? m("div", {
                  class: "message-input-logo message-input-logo--busy",
                  role: "img",
                  "aria-label": "Creating…",
                })
              : hasMessageText
                ? m(
                    "button",
                    {
                      class: "new-conversation-send-button",
                      onclick: handleCreateConversation,
                    },
                    m.trust(
                      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
                    ),
                  )
                : m("div", {
                    class: "message-input-logo",
                    role: "img",
                    "aria-label": "LLM Webchat",
                  }),
          ]),
        ]),
      ]),
      m("div", { class: "system-prompt-section flex flex-col gap-1" }, [
        m(
          "button",
          {
            class:
              "system-prompt-toggle text-xs transition-colors cursor-pointer bg-transparent border-none p-0 self-start",
            onclick: () => {
              systemPromptExpanded = !systemPromptExpanded;
            },
          },
          [m("span", systemPromptExpanded ? "▾ " : "▸ "), "System prompt"],
        ),
        systemPromptExpanded
          ? m("textarea", {
              class:
                "system-prompt-textbox w-full resize-none rounded-lg border px-4 pt-3 pb-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none transition-colors",
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
        class: "app-footer",
        "data-slot": "new-conversation-footer",
      }),
    ]);
  },
};
