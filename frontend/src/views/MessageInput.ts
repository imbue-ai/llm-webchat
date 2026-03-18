import m from "mithril";
import { clearStreamingMessage, isStreaming } from "../models/StreamingMessage";
import { sendMessage } from "../models/Response";
import { getDefaultModelId, persistSelectedModelId } from "../models/Model";
import { ModelSelector } from "./ModelSelector";
import { Spinner } from "./Spinner";

const MAX_TEXTAREA_HEIGHT_PX = 200;

let messageText = "";
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
    const sendButtonLabel = sending ? "Sending…" : streaming ? "Generating…" : "Send";

    return m("div", { class: "message-input mx-auto w-full max-w-(--width-message-column) flex items-center gap-3" }, [
      m(
        "div",
        {
          class:
            "message-input-box flex-1 flex flex-col rounded-lg border border-border bg-surface focus-within:border-primary transition-colors",
        },
        [
          m("textarea", {
            class:
              "message-input-textbox w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none",
            style: { overflowY: "hidden" },
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
              autoResizeTextarea(textarea);
            },
            onkeydown: handleKeydown,
          }),
          m("div", { class: "message-input-toolbar flex justify-end px-3 pb-2" }, [
            m(ModelSelector, {
              selectedModelId,
              disabled: busy,
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
            "message-input-send-button inline-flex w-36 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium text-white transition-colors",
            busy ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary-hover cursor-pointer",
          ].join(" "),
          disabled: busy || !hasMessageText,
          onclick: handleSend,
        },
        busy ? [m(Spinner), sendButtonLabel] : sendButtonLabel,
      ),
    ]);
  },
};
