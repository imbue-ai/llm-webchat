import m from "mithril";
import { isStreaming } from "./MessageList";

const MAX_TEXTAREA_HEIGHT_PX = 200;

let messageText = "";
let sending = false;

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
}

export async function sendMessage(conversationId: string, message: string): Promise<void> {
  if (!message.trim() || sending || isStreaming()) {
    return;
  }
  sending = true;
  m.redraw();

  try {
    await m.request({
      method: "POST",
      url: "/api/conversations/:conversationId/message",
      params: { conversationId },
      body: { message: message.trim() },
    });
    messageText = "";
  } finally {
    sending = false;
    m.redraw();
  }
}

export const MessageInput: m.Component<{ conversationId: string | null }> = {
  view(vnode) {
    const conversationId = vnode.attrs.conversationId;

    if (!conversationId) {
      return null;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (conversationId) {
          sendMessage(conversationId, messageText);
        }
      }
    }

    return m("div", { class: "message-input mx-auto w-full max-w-(--width-message-column) flex items-end gap-3" }, [
      m("textarea", {
        class:
          "message-input-textbox flex-1 resize-none rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none",
        style: { overflowY: "hidden" },
        placeholder: "Type a message…",
        rows: 1,
        value: messageText,
        disabled: sending || isStreaming(),
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
      m(
        "button",
        {
          class: [
            "message-input-send-button rounded-lg px-5 py-3 text-sm font-medium text-white transition-colors",
            sending || isStreaming()
              ? "bg-primary/50 cursor-not-allowed"
              : "bg-primary hover:bg-primary-hover cursor-pointer",
          ].join(" "),
          disabled: sending || isStreaming() || !messageText.trim(),
          onclick: () => {
            if (conversationId) {
              sendMessage(conversationId, messageText);
            }
          },
        },
        sending ? "Sending…" : "Send",
      ),
    ]);
  },
};
