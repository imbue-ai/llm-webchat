import m from "mithril";
import { isSlotClaimed } from "../slots";
import { getSelectedConversationId } from "../models/Conversation";
import { getLastResponseModel, isConversationNotFound } from "../models/Response";
import { MessageList } from "./MessageList";
import { setSelectedModelId } from "./MessageInput";
import { NewConversation } from "./NewConversation";
import { Sidebar } from "./Sidebar";
import { connectToStream, disconnectFromStream } from "../models/StreamingMessage";

export function App(): m.Component {
  let previousConversationId: string | null = null;
  let modelSyncedForConversation: string | null = null;

  return {
    view() {
      const selectedConversationId = getSelectedConversationId();
      const isNewConversationRoute = m.route.get() === "/new";

      if (selectedConversationId) {
        if (!isConversationNotFound(selectedConversationId)) {
          connectToStream(selectedConversationId);
        } else {
          disconnectFromStream();
        }
      } else if (previousConversationId !== null) {
        disconnectFromStream();
      }

      const conversationChanged = previousConversationId !== selectedConversationId;
      if (conversationChanged && previousConversationId !== null) {
        modelSyncedForConversation = null;
      }
      previousConversationId = selectedConversationId;

      if (selectedConversationId && modelSyncedForConversation !== selectedConversationId) {
        const lastModel = getLastResponseModel(selectedConversationId);
        if (lastModel) {
          setSelectedModelId(lastModel);
          modelSyncedForConversation = selectedConversationId;
        }
      }

      const contentComponent = isNewConversationRoute
        ? m(NewConversation)
        : m(MessageList, { conversationId: selectedConversationId });

      return m("div", { class: "app-layout flex h-screen" }, [
        m(Sidebar),
        m("div", { class: "app-main flex flex-1 flex-col" }, [
          m(
            "header",
            { class: "app-header border-b border-border px-6 py-3", "data-slot": "header" },
            isSlotClaimed("header")
              ? null
              : [m("h1", { class: "text-xl font-bold text-text-primary" }, "llm webchat")],
          ),
          contentComponent,
        ]),
      ]);
    },
  };
}
