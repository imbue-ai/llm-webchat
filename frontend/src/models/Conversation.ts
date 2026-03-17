import m from "mithril";
import { runHook } from "../llm-api";

export interface Conversation {
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

export function getLoadingError(): string | null {
  return loadingError;
}

export function getSelectedConversationId(): string | null {
  const attrs = m.route.param("conversationId");
  return attrs ?? null;
}

export function selectConversation(conversationId: string): void {
  m.route.set("/conversations/:conversationId", { conversationId });
}

export function navigateToNewConversation(): void {
  m.route.set("/new");
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
