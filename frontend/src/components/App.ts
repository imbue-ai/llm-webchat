import m from "mithril";
import { ConversationSelector, getSelectedConversationId } from "./ConversationSelector";
import {
  MessageList,
  fetchResponses,
  getLastResponseModel,
  isConversationNotFound,
  refetchCurrentConversation,
} from "./MessageList";
import { MessageInput } from "./MessageInput";
import { setSelectedModelId } from "./ModelSelector";
import { NewConversation } from "./NewConversation";
import { connectToStream, disconnectFromStream } from "./StreamingConnection";

const SCROLL_BOTTOM_THRESHOLD_PX = 40;

let previousConversationId: string | null = null;
let userScrolledUp = false;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
}

function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

function handleScrollEvent(event: Event): void {
  const element = event.target as HTMLElement;
  userScrolledUp = !isNearBottom(element);
}

export const App: m.Component = {
  view() {
    const selectedConversationId = getSelectedConversationId();
    const isNewConversationRoute = m.route.get() === "/new";

    if (selectedConversationId) {
      fetchResponses(selectedConversationId);
      if (!isConversationNotFound()) {
        connectToStream(selectedConversationId);
      } else {
        disconnectFromStream();
      }
    } else if (previousConversationId !== null) {
      disconnectFromStream();
    }

    const conversationChanged = previousConversationId !== selectedConversationId;
    if (conversationChanged && previousConversationId !== null) {
      refetchCurrentConversation();
      userScrolledUp = false;
    }
    previousConversationId = selectedConversationId;

    if (conversationChanged && selectedConversationId) {
      const lastModel = getLastResponseModel();
      if (lastModel) {
        setSelectedModelId(lastModel);
      }
    }

    const mainContent = isNewConversationRoute
      ? m(
          "main",
          {
            class: "app-content flex-1 overflow-y-auto p-6",
            "data-slot": "content",
          },
          [m(NewConversation)],
        )
      : m(
          "main",
          {
            class: "app-content flex-1 overflow-y-auto p-6",
            "data-slot": "content",
            onscroll: handleScrollEvent,
            oncreate: (mainVnode: m.VnodeDOM) => {
              scrollToBottom(mainVnode.dom as HTMLElement);
            },
            onupdate: (mainVnode: m.VnodeDOM) => {
              if (!userScrolledUp) {
                scrollToBottom(mainVnode.dom as HTMLElement);
              }
            },
          },
          [m(MessageList, { conversationId: selectedConversationId })],
        );

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
        mainContent,
        isNewConversationRoute || isConversationNotFound()
          ? null
          : m(
              "footer",
              { class: "app-footer border-t border-border px-6 py-3", "data-slot": "footer" },
              m(MessageInput, { conversationId: selectedConversationId }),
            ),
      ]),
    ]);
  },
};
