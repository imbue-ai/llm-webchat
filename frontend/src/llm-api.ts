import type { Conversation } from "./models/Conversation";
import { getConversations } from "./models/Conversation";
import type { Model } from "./models/Model";
import { getModels } from "./models/Model";
import type { ResponseItem } from "./models/Response";
import { getAllResponses } from "./models/Response";
import type { MessageData, HookDataMap, HookName, HookCallback } from "./hooks";
import { runHook, registerHook } from "./hooks";
import { claimSlot } from "./slots";

function responseItemToMessageData(item: ResponseItem): MessageData {
  return {
    id: item.id,
    conversationId: item.conversation_id,
    model: item.model,
    prompt: item.prompt,
    system: item.system,
    response: item.response,
    datetimeUtc: item.datetime_utc,
    durationMs: item.duration_ms,
    inputTokens: item.input_tokens,
    outputTokens: item.output_tokens,
  };
}

interface LlmApi {
  claim(slotName: string): boolean;
  getMessage(messageId: string): Promise<MessageData | null>;
  getConversations(): Conversation[];
  getConversation(conversationId: string): Conversation | null;
  getModels(): Model[];
  on<K extends HookName>(eventName: K, callback: HookCallback<HookDataMap[K]>): void;
}

const llmApi: LlmApi = {
  claim(slotName: string): boolean {
    return claimSlot(slotName);
  },

  async getMessage(messageId: string): Promise<MessageData | null> {
    for (const responses of Object.values(getAllResponses())) {
      for (const item of responses) {
        if (item.id === messageId) {
          const messageData = responseItemToMessageData(item);
          const hookResult = await runHook("get_message", { message: messageData });
          return hookResult.message;
        }
      }
    }
    return null;
  },

  getConversations(): Conversation[] {
    return [...getConversations()];
  },

  getConversation(conversationId: string): Conversation | null {
    return getConversations().find((conversation) => conversation.id === conversationId) ?? null;
  },

  getModels(): Model[] {
    return [...getModels()];
  },

  on<K extends HookName>(eventName: K, callback: HookCallback<HookDataMap[K]>): void {
    registerHook(eventName, callback);
  },
};

export { llmApi };

export type { LlmApi };
