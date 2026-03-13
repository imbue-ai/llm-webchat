import m from "mithril";
import { ConversationSelector, getSelectedConversationId } from "./ConversationSelector";
import { MessageList, fetchResponses, refetchCurrentConversation } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { connectToStream, disconnectFromStream } from "./StreamingConnection";

let previousConversationId: string | null = null;

export const App: m.Component = {
  view() {
    const selectedConversationId = getSelectedConversationId();

    if (selectedConversationId) {
      fetchResponses(selectedConversationId);
      connectToStream(selectedConversationId);
    } else if (previousConversationId !== null) {
      disconnectFromStream();
    }

    if (previousConversationId !== selectedConversationId && previousConversationId !== null) {
      refetchCurrentConversation();
    }
    previousConversationId = selectedConversationId;

    return m("div", { class: "app-layout flex h-screen" }, [
      m(
        "aside",
        { class: "app-sidebar w-64 border-r border-border bg-surface-secondary p-4", "data-slot": "sidebar" },
        [m(ConversationSelector)],
      ),
      m("div", { class: "app-main flex flex-1 flex-col" }, [
        m("header", { class: "app-header border-b border-border px-6 py-3", "data-slot": "header" }, [
          m("h1", { class: "text-xl font-bold text-text-primary" }, "llm webchat"),
        ]),
        m("main", { class: "app-content flex-1 overflow-y-auto p-6", "data-slot": "content" }, [
          m(MessageList, { conversationId: selectedConversationId }),
        ]),
        m(
          "footer",
          { class: "app-footer border-t border-border px-6 py-3", "data-slot": "footer" },
          m(MessageInput, { conversationId: selectedConversationId }),
        ),
      ]),
    ]);
  },
};
