import m from "mithril";
import { isSlotClaimed } from "../slots";
import { getSelectedConversationId, isNewConversationRoute } from "../navigation";
import { EmptySlot } from "./EmptySlot";
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
        m("div", { class: "app-main flex flex-1 flex-col" }, [
          m(
            "header",
            {
              class: "app-header border-b border-border px-6 py-3 flex items-center justify-between",
              "data-slot": "header",
            },
            isSlotClaimed("header")
              ? null
              : [
                  m("h1", { class: "text-xl font-bold text-text-primary" }, "LLM Webchat"),
                  m(EmptySlot, { name: "header-actions" }),
                ],
          ),
          m(EmptySlot, { name: "conversation-after-header" }),
          contentComponent,
        ]),
      ]);
    },
  };
}
