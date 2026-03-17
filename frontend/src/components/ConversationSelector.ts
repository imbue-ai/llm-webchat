import m from "mithril";
import { isSlotClaimed, runHook, setConversationsStore } from "../llm-api";

interface Conversation {
  id: string;
  name: string;
  model: string;
}

interface ConversationListResponse {
  conversations: Conversation[];
}

let conversations: Conversation[] = [];
let loadingError: string | null = null;
let conversationsLoaded = false;

export function getConversations(): Conversation[] {
  return conversations;
}

export function getConversationsLoaded(): boolean {
  return conversationsLoaded;
}

export async function fetchConversations(): Promise<void> {
  try {
    const response = await m.request<ConversationListResponse>({
      method: "GET",
      url: "/api/conversations",
    });
    const hookResult = runHook("get_conversations", {
      conversations: response.conversations,
    });
    conversations = hookResult.conversations;
    setConversationsStore(conversations);
    loadingError = null;
    conversationsLoaded = true;
    if (!getSelectedConversationId() && m.route.get() !== "/new") {
      if (conversations.length > 0) {
        selectConversation(conversations[0].id);
      } else {
        m.route.set("/new");
      }
    }
  } catch (error) {
    loadingError = (error as Error).message;
    conversationsLoaded = true;
  }
}

function selectConversation(conversationId: string): void {
  m.route.set("/conversations/:conversationId", { conversationId });
}

function navigateToNewConversation(): void {
  m.route.set("/new");
}

export function getSelectedConversationId(): string | null {
  const attrs = m.route.param("conversationId");
  return attrs ?? null;
}

export const ConversationSelector: m.Component = {
  oninit() {
    fetchConversations();
  },
  view() {
    const currentConversationId = getSelectedConversationId();

    const sidebarHeaderClaimed = isSlotClaimed("sidebar-header");
    const sidebarHeader = m(
      "div",
      { "data-slot": "sidebar-header" },
      sidebarHeaderClaimed
        ? null
        : [
            m("h2", { class: "conversation-selector-title text-lg font-semibold text-text-primary" }, "Conversations"),
            m(
              "button",
              {
                class: [
                  "new-conversation-button mt-3 mb-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer",
                  "bg-primary hover:bg-primary-hover",
                ].join(" "),
                onclick: navigateToNewConversation,
              },
              "+ New Conversation",
            ),
          ],
    );

    const conversationSelectorItemClaimed = isSlotClaimed("conversation-selector-item");

    return m("div", { class: "conversation-selector", "data-slot": "conversation-selector" }, [
      sidebarHeader,
      loadingError
        ? m("p", { class: "conversation-selector-error mt-2 text-sm text-red-500" }, `Error: ${loadingError}`)
        : conversations.length === 0
          ? m("p", { class: "conversation-selector-empty mt-2 text-sm text-text-secondary" }, "No conversations yet.")
          : m(
              "ul",
              { class: "conversation-selector-list mt-2 space-y-1" },
              conversations.map((conversation) =>
                m(
                  "li",
                  {
                    key: conversation.id,
                    class: [
                      "conversation-selector-item",
                      "cursor-pointer rounded px-3 py-2 text-sm transition-colors",
                      conversation.id === currentConversationId
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
                    ].join(" "),
                    "data-slot": "conversation-selector-item",
                    "data-conversation-id": conversation.id,
                    onclick: () => selectConversation(conversation.id),
                  },
                  conversationSelectorItemClaimed
                    ? null
                    : [
                        m(
                          "div",
                          { class: "conversation-selector-item-name truncate" },
                          conversation.name || "Untitled conversation",
                        ),
                        m(
                          "div",
                          { class: "conversation-selector-item-model mt-0.5 truncate text-xs text-text-secondary" },
                          conversation.model,
                        ),
                      ],
                ),
              ),
            ),
    ]);
  },
};
