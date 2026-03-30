import m from "mithril";
import { clearStreamingMessage, isStreaming } from "../models/StreamingMessage";
import { sendMessage } from "../models/Response";
import { getDefaultModelId, persistSelectedModelId } from "../models/Model";
import { ModelSelector } from "./ModelSelector";

const MAX_TEXTAREA_HEIGHT_PX = 200;

const MESSAGE_TEXT_KEY_PREFIX = "message-text:";

function messageTextKey(conversationId: string): string {
  return `${MESSAGE_TEXT_KEY_PREFIX}${conversationId}`;
}

let messageText = "";
let currentConversationId: string | null = null;
let sending = false;
let selectedModelId: string | null = null;
let messageTextareaElement: HTMLTextAreaElement | null = null;

export function setSelectedModelId(modelId: string): void {
  selectedModelId = modelId;
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
}

function focusMessageTextarea(): void {
  messageTextareaElement?.focus();
}

export const MessageInput: m.Component<{ conversationId: string | null }> = {
  view(vnode) {
    const conversationId = vnode.attrs.conversationId;

    if (!conversationId) {
      return null;
    }

    if (currentConversationId !== conversationId) {
      currentConversationId = conversationId;
      messageText = localStorage.getItem(messageTextKey(conversationId)) ?? "";
    }

    if (selectedModelId === null) {
      selectedModelId = getDefaultModelId();
    }

    async function handleSend(): Promise<void> {
      const modelId = selectedModelId;
      if (!conversationId || !modelId || sending || isStreaming()) {
        return;
      }
      sending = true;
      clearStreamingMessage();
      m.redraw();

      try {
        await sendMessage(conversationId, messageText, modelId);
        messageText = "";
        localStorage.removeItem(messageTextKey(conversationId));
      } finally {
        sending = false;
        m.redraw();
        requestAnimationFrame(() => {
          focusMessageTextarea();
        });
      }
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    }

    const streaming = isStreaming();
    const hasMessageText = messageText.trim().length > 0;
    const busy = sending || streaming;

    return m("div", { class: "message-input mx-auto w-full" }, [
      m("div", { class: "message-input-box flex flex-col" }, [
        m("textarea", {
          class: "message-input-textbox w-full resize-none focus:outline-none",
          placeholder: "Type a message…",
          rows: 1,
          value: messageText,
          disabled: sending,
          oncreate: (textareaVnode: m.VnodeDOM) => {
            messageTextareaElement = textareaVnode.dom as HTMLTextAreaElement;
            autoResizeTextarea(messageTextareaElement);
            focusMessageTextarea();
          },
          onupdate: (textareaVnode: m.VnodeDOM) => {
            messageTextareaElement = textareaVnode.dom as HTMLTextAreaElement;
            autoResizeTextarea(messageTextareaElement);
          },
          onremove: () => {
            messageTextareaElement = null;
          },
          oninput: (event: Event) => {
            const textarea = event.target as HTMLTextAreaElement;
            messageText = textarea.value;
            localStorage.setItem(messageTextKey(conversationId), messageText);
            autoResizeTextarea(textarea);
          },
          onkeydown: handleKeydown,
        }),
        m("div", { class: "message-input-toolbar" }, [
          m("div", { class: "message-input-toolbar-left" }, [
            m(ModelSelector, {
              selectedModelId,

              onSelect: (modelId: string) => {
                selectedModelId = modelId;
                persistSelectedModelId(modelId);
              },
            }),
          ]),
          busy
            ? m("div", {
                class: "message-input-logo message-input-logo--busy",
                role: "img",
                "aria-label": "Generating…",
              })
            : hasMessageText
              ? m(
                  "button",
                  {
                    class: "message-input-send-button",
                    onclick: handleSend,
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
    ]);
  },
};
