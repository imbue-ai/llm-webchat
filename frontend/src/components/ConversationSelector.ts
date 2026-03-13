import m from "mithril";

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

async function fetchConversations(): Promise<void> {
  try {
    const response = await m.request<ConversationListResponse>({
      method: "GET",
      url: "/api/conversations",
    });
    conversations = response.conversations;
    loadingError = null;
  } catch (error) {
    loadingError = (error as Error).message;
  }
}

function selectConversation(conversationId: string): void {
  m.route.set("/conversations/:conversationId", { conversationId });
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
    return m("div", { class: "conversation-selector", "data-slot": "conversation-selector" }, [
      m("h2", { class: "conversation-selector-title text-lg font-semibold text-text-primary" }, "Conversations"),
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
                    onclick: () => selectConversation(conversation.id),
                  },
                  [
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
