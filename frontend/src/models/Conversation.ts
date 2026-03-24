import m from "mithril";
import { runHook } from "../hooks";
import { getSelectedConversationId, selectConversation } from "../navigation";

export interface Conversation {
  id: string;
  name: string;
  model: string;
  latest_response_datetime_utc: string | null;
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
  tools: string[] = [],
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

  await runHook("post_conversation", {
    id: conversationId,
    name,
    model: modelId,
  });

  await fetchConversations();

  const messageBody: Record<string, string | string[]> = { message: trimmedMessage, model: modelId };
  if (trimmedSystemPrompt) {
    messageBody.system_prompt = trimmedSystemPrompt;
  }
  if (tools.length > 0) {
    messageBody.tools = tools;
  }

  const postMessageHookData = await runHook("post_conversation_message", {
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
      ...(tools.length > 0 ? { tools } : {}),
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
    const hookResult = await runHook("get_conversations", {
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
