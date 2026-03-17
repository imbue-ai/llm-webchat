import m from "mithril";
import { runHook } from "../hooks";

export interface Conversation {
  id: string;
  name: string;
  model: string;
}

interface ConversationListResponse {
  conversations: Conversation[];
}

interface CreateConversationResponse {
  id: string;
}

const CONVERSATION_NAME_LENGTH = 32;

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

function conversationName(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= CONVERSATION_NAME_LENGTH) {
    return collapsed;
  }
  return collapsed.slice(0, CONVERSATION_NAME_LENGTH - 1) + "…";
}

export async function createConversationAndSend(
  message: string,
  modelId: string,
  systemPrompt: string,
): Promise<string> {
  const trimmedMessage = message.trim();
  const trimmedSystemPrompt = systemPrompt.trim();
  const name = conversationName(trimmedMessage);

  const response = await m.request<CreateConversationResponse>({
    method: "POST",
    url: "/api/conversations",
    body: { name, model: modelId },
  });
  const conversationId = response.id;

  runHook("post_conversation", {
    id: conversationId,
    name,
    model: modelId,
  });

  await fetchConversations();

  const messageBody: Record<string, string> = { message: trimmedMessage, model: modelId };
  if (trimmedSystemPrompt) {
    messageBody.system_prompt = trimmedSystemPrompt;
  }

  const postMessageHookData = runHook("post_conversation_message", {
    conversationId,
    message: trimmedMessage,
    model: modelId,
    systemPrompt: trimmedSystemPrompt || undefined,
  });

  await m.request({
    method: "POST",
    url: "/api/conversations/:conversationId/message",
    params: { conversationId },
    body: {
      message: postMessageHookData.message,
      model: postMessageHookData.model,
      ...(postMessageHookData.systemPrompt ? { system_prompt: postMessageHookData.systemPrompt } : {}),
    },
  });

  return conversationId;
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
