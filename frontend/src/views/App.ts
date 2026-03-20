import m from "mithril";
import { getSelectedConversationId, isNewConversationRoute } from "../navigation";
import { MessageList } from "./MessageList";
import { NewConversation } from "./NewConversation";
import { Sidebar } from "./Sidebar";

export function App(): m.Component {
  return {
    view() {
      const selectedConversationId = getSelectedConversationId();

      const contentComponent = isNewConversationRoute()
        ? m(NewConversation)
        : m(MessageList, { conversationId: selectedConversationId });

      return m("div", { class: "app-layout flex h-screen" }, [
        m(Sidebar),
        m("div", { class: "app-main flex flex-1 flex-col min-w-80" }, [contentComponent]),
      ]);
    },
  };
}
