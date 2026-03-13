import m from "mithril";
import { ConversationSelector, getSelectedConversationId } from "./ConversationSelector";
import { MessageList, fetchResponses } from "./MessageList";

export const App: m.Component = {
  view() {
    const selectedConversationId = getSelectedConversationId();

    if (selectedConversationId) {
      fetchResponses(selectedConversationId);
    }

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
        m("footer", { class: "app-footer border-t border-border px-6 py-3", "data-slot": "footer" }, [
          m("p", { class: "text-sm text-text-secondary" }, "Ready."),
        ]),
      ]),
    ]);
  },
};
