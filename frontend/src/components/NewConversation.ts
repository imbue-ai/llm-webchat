import m from "mithril";
import { fetchConversations } from "./ConversationSelector";
import { fetchResponses, startStreamingMessage } from "./MessageList";
import { ModelSelector, getSelectedModelId } from "./ModelSelector";

const MAX_TEXTAREA_HEIGHT_PX = 200;
const CONVERSATION_NAME_LENGTH = 32;

interface CreateConversationResponse {
  id: string;
}

let messageText = "";
let systemPromptText = "";
let systemPromptExpanded = false;
let creating = false;

function conversationName(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= CONVERSATION_NAME_LENGTH) {
    return collapsed;
  }
  return collapsed.slice(0, CONVERSATION_NAME_LENGTH - 1) + "…";
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
}

async function createConversationAndSend(): Promise<void> {
  const trimmedMessage = messageText.trim();
  const modelId = getSelectedModelId();
  if (!trimmedMessage || !modelId || creating) {
    return;
  }
  creating = true;
  m.redraw();

  try {
    const response = await m.request<CreateConversationResponse>({
      method: "POST",
      url: "/api/conversations",
      body: { name: conversationName(trimmedMessage), model: modelId },
    });
    const conversationId = response.id;
    const trimmedSystemPrompt = systemPromptText.trim();
    messageText = "";
    systemPromptText = "";
    systemPromptExpanded = false;

    await fetchConversations();

    // Pre-initialize fetchResponses so that when App.view() re-renders
    // after the route change, its call to fetchResponses() will hit
    // the "already loaded" guard and won't clear streamingMessage.
    await fetchResponses(conversationId);

    // Navigate to the conversation page. This schedules a mithril
    // redraw that will call connectToStream() via App.view().
    m.route.set("/conversations/:conversationId", { conversationId });

    // Show the user message bubble immediately, before the SSE
    // connection is established (so we don't rely on catching the
    // server's user_message event).
    startStreamingMessage(trimmedMessage);

    // POST the message directly instead of going through sendMessage(),
    // which would call clearStreamingMessage() and interfere with the
    // streaming state we just set up.
    const messageBody: Record<string, string> = { message: trimmedMessage, model: modelId };
    if (trimmedSystemPrompt) {
      messageBody.system_prompt = trimmedSystemPrompt;
    }
    await m.request({
      method: "POST",
      url: "/api/conversations/:conversationId/message",
      params: { conversationId },
      body: messageBody,
    });
  } finally {
    creating = false;
    m.redraw();
  }
}

export const NewConversation: m.Component = {
  view() {
    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        createConversationAndSend();
      }
    }

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
              m("div", { class: "new-conversation-toolbar flex justify-end px-3 pb-2" }, [m(ModelSelector)]),
            ],
          ),
          m(
            "button",
            {
              class: [
                "new-conversation-send-button rounded-lg px-5 py-3 text-sm font-medium text-white transition-colors",
                creating ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary-hover cursor-pointer",
              ].join(" "),
              disabled: creating || !messageText.trim(),
              onclick: createConversationAndSend,
            },
            creating ? "Creating…" : "Send",
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
              class: "new-conversation-send-button-spacer rounded-lg px-5 py-3 text-sm font-medium invisible",
            },
            "Send",
          ),
        ]),
      ]),
    ]);
  },
};
