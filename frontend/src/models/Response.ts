import m from "mithril";
import { runHook } from "../hooks";
import { apiUrl } from "../base-path";
import { getConversations } from "./Conversation";

export interface ResponseItem {
  id: string;
  model: string;
  prompt: string | null;
  system: string | null;
  response: string;
  conversation_id: string;
  datetime_utc: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = "ConversationNotFoundError";
  }
}

interface ResponseListResponse {
  responses: ResponseItem[];
}

const responses: Record<string, ResponseItem[]> = {};
const notFoundConversationIds = new Set<string>();

export function isConversationNotFound(conversationId: string): boolean {
  return notFoundConversationIds.has(conversationId);
}

export function getResponsesForConversation(conversationId: string): ResponseItem[] {
  return responses[conversationId] ?? [];
}

export function getAllResponses(): Record<string, ResponseItem[]> {
  return responses;
}

export function getLastResponseModel(conversationId: string): string | null {
  const conversationResponses = responses[conversationId];
  if (!conversationResponses || conversationResponses.length === 0) {
    return null;
  }
  const model = conversationResponses[conversationResponses.length - 1].model;
  return model || null;
}

export function appendSyntheticResponse(
  conversationId: string,
  prompt: string,
  response: string,
  model: string | null,
): void {
  const syntheticItem: ResponseItem = {
    id: `streaming-${Date.now()}`,
    model: model ?? "",
    prompt,
    system: null,
    response,
    conversation_id: conversationId,
    datetime_utc: new Date().toISOString(),
    duration_ms: null,
    input_tokens: null,
    output_tokens: null,
  };
  const existing = responses[conversationId] ?? [];
  responses[conversationId] = [...existing, syntheticItem];
}

export class ConversationNotFoundForInsertError extends Error {
  constructor(conversationId: string) {
    super(`Cannot insert response: conversation not found: ${conversationId}`);
    this.name = "ConversationNotFoundForInsertError";
  }
}

export async function insertResponseItem(conversationId: string, responseItem: ResponseItem): Promise<void> {
  const conversation = getConversations().find((c) => c.id === conversationId);
  if (!conversation) {
    throw new ConversationNotFoundForInsertError(conversationId);
  }

  const hookResult = await runHook("insert_response", {
    conversationId,
    response: responseItem,
  });

  const existing = responses[conversationId] ?? [];
  responses[conversationId] = [...existing, hookResult.response];
  m.redraw();
}

export async function fetchResponses(conversationId: string): Promise<ResponseItem[]> {
  notFoundConversationIds.delete(conversationId);

  const result = await m
    .request<ResponseListResponse>({
      method: "GET",
      url: apiUrl("/api/conversations/:conversationId/responses"),
      params: { conversationId },
    })
    .catch((error) => {
      const requestError = error as { code?: number; message?: string };
      if (requestError.code === 404) {
        notFoundConversationIds.add(conversationId);
        throw new ConversationNotFoundError(conversationId);
      }
      throw error;
    });

  const hookResult = await runHook("get_conversation", {
    conversationId,
    responses: result.responses,
  });
  responses[conversationId] = hookResult.responses;
  return hookResult.responses;
}

export async function sendMessage(conversationId: string, message: string, modelId: string): Promise<void> {
  if (!message.trim()) {
    return;
  }

  const hookResult = await runHook("post_conversation_message", {
    conversationId,
    message: message.trim(),
    model: modelId,
  });

  await m.request({
    method: "POST",
    url: apiUrl("/api/conversations/:conversationId/message"),
    params: { conversationId },
    body: {
      message: hookResult.message,
      model: hookResult.model,
      ...(hookResult.systemPrompt ? { system_prompt: hookResult.systemPrompt } : {}),
    },
  });
}
