import m from "mithril";
import { isSlotClaimed } from "../llm-api";
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
let modelSyncedForConversation: string | null = null;
let sidebarCollapsed = false;

function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed;
}

function sidebarIconButton(label: string, onclick: () => void, svgPath: string): m.Vnode {
  return m(
    "button",
    {
      class: "sidebar-icon-button",
      onclick,
      "aria-label": label,
      title: label,
    },
    m.trust(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`,
    ),
  );
}

const ICON_PANEL_LEFT_CLOSE = '<path d="M3 3h18v18H3z"/><path d="M9 3v18"/><path d="M14 9l-3 3 3 3"/>';
const ICON_PANEL_LEFT_OPEN = '<path d="M3 3h18v18H3z"/><path d="M9 3v18"/><path d="M14 9l3 3-3 3"/>';
const ICON_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';

function navigateToNewConversation(): void {
  m.route.set("/new");
}

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
    if (conversationChanged) {
      if (previousConversationId !== null) {
        refetchCurrentConversation();
        modelSyncedForConversation = null;
      }
      userScrolledUp = window.location.hash.length > 1;
    }
    previousConversationId = selectedConversationId;

    if (selectedConversationId && modelSyncedForConversation !== selectedConversationId) {
      const lastModel = getLastResponseModel();
      if (lastModel) {
        setSelectedModelId(lastModel);
        modelSyncedForConversation = selectedConversationId;
      }
    }

    const headerClaimed = isSlotClaimed("header");
    const sidebarClaimed = isSlotClaimed("sidebar");

    const mainContent = isNewConversationRoute
      ? m(
          "main",
          {
            class: "app-content flex-1 overflow-y-auto p-6",
            "data-slot": "new-conversation-content",
          },
          isSlotClaimed("new-conversation-content") ? null : [m(NewConversation)],
        )
      : m(
          "main",
          {
            class: "app-content flex-1 overflow-y-auto p-6",
            "data-slot": "conversation-content",
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
          isSlotClaimed("conversation-content") ? null : [m(MessageList, { conversationId: selectedConversationId })],
        );

    const showConversationFooter = !isNewConversationRoute && !isConversationNotFound();
    const showNewConversationFooter = isNewConversationRoute;

    let footerElement: m.Vnode | null = null;
    if (showConversationFooter) {
      footerElement = m(
        "footer",
        { class: "app-footer border-t border-border px-6 py-3", "data-slot": "conversation-footer" },
        isSlotClaimed("conversation-footer") ? null : m(MessageInput, { conversationId: selectedConversationId }),
      );
    } else if (showNewConversationFooter) {
      footerElement = m("footer", {
        class: "app-footer border-t border-border px-6 py-3",
        "data-slot": "new-conversation-footer",
      });
    }

    const sidebarClass = [
      "app-sidebar border-r border-border bg-surface-secondary p-4",
      sidebarCollapsed ? "app-sidebar--collapsed" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const collapsedRail = m("div", { class: "sidebar-collapsed-content" }, [
      sidebarIconButton("Expand sidebar", toggleSidebar, ICON_PANEL_LEFT_OPEN),
      sidebarIconButton("New conversation", navigateToNewConversation, ICON_PLUS),
    ]);

    const collapseButton = sidebarIconButton("Collapse sidebar", toggleSidebar, ICON_PANEL_LEFT_CLOSE);

    const expandedContent = m("div", { class: "sidebar-expanded-content flex flex-col flex-1 min-h-0" }, [
      m(ConversationSelector, { collapseButton }),
    ]);

    return m("div", { class: "app-layout flex h-screen" }, [
      m(
        "aside",
        { class: sidebarClass, "data-slot": "sidebar" },
        sidebarClaimed ? null : [collapsedRail, expandedContent],
      ),
      m("div", { class: "app-main flex flex-1 flex-col" }, [
        m(
          "header",
          { class: "app-header border-b border-border px-6 py-3", "data-slot": "header" },
          headerClaimed ? null : [m("h1", { class: "text-xl font-bold text-text-primary" }, "llm webchat")],
        ),
        mainContent,
        footerElement,
      ]),
    ]);
  },
};
