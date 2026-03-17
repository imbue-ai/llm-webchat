import m from "mithril";
import { runHook } from "../hooks";

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

export async function fetchResponses(conversationId: string): Promise<ResponseItem[]> {
  const result = await m
    .request<ResponseListResponse>({
      method: "GET",
      url: "/api/conversations/:conversationId/responses",
      params: { conversationId },
    })
    .catch((error) => {
      const requestError = error as { code?: number; message?: string };
      if (requestError.code === 404) {
        throw new ConversationNotFoundError(conversationId);
      }
      throw error;
    });

  const hookResult = runHook("get_conversation", {
    conversationId,
    responses: result.responses,
  });
  responses[conversationId] = hookResult.responses;
  return hookResult.responses;
}
