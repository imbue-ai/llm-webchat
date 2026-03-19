import type { Conversation } from "./models/Conversation";
import { getConversations } from "./models/Conversation";
import type { Model } from "./models/Model";
import { getModels } from "./models/Model";
import type { ResponseItem } from "./models/Response";
import { getAllResponses } from "./models/Response";
import type { HookDataMap, HookName, HookCallback } from "./hooks";
import { runHook, registerHook } from "./hooks";
import { claimSlot } from "./slots";

interface LlmApi {
  claim(slotName: string): boolean;
  getResponse(responseId: string): Promise<ResponseItem | null>;
  getConversations(): Conversation[];
  getConversation(conversationId: string): Conversation | null;
  getModels(): Model[];
  on<K extends HookName>(eventName: K, callback: HookCallback<HookDataMap[K]>): void;
}

const llmApi: LlmApi = {
  claim(slotName: string): boolean {
    return claimSlot(slotName);
  },

  async getResponse(responseId: string): Promise<ResponseItem | null> {
    for (const responses of Object.values(getAllResponses())) {
      for (const item of responses) {
        if (item.id === responseId) {
          const hookResult = await runHook("get_response", { response: item });
          return hookResult.response;
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
