// $llm global plugin API — must be imported before anything else

interface ConversationInfo {
  id: string;
  name: string;
  model: string;
}

interface ResponseItem {
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

interface MessageData {
  id: string;
  conversationId: string;
  model: string;
  prompt: string | null;
  system: string | null;
  response: string;
  datetimeUtc: string;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface ModelInfo {
  model_id: string;
}

interface GetConversationsHookData {
  conversations: ConversationInfo[];
}

interface GetConversationHookData {
  conversationId: string;
  responses: ResponseItem[];
}

interface PostConversationHookData {
  id: string;
  name: string;
  model: string;
}

interface PostConversationMessageHookData {
  conversationId: string;
  message: string;
  model: string;
  systemPrompt?: string;
}

interface GetMessageHookData {
  message: MessageData;
}

interface StreamEventHookData {
  conversationId: string;
  event: {
    type: string;
    content?: string;
  };
}

type HookDataMap = {
  ready: void;
  get_conversations: GetConversationsHookData;
  get_conversation: GetConversationHookData;
  post_conversation: PostConversationHookData;
  post_conversation_message: PostConversationMessageHookData;
  get_message: GetMessageHookData;
  stream_event: StreamEventHookData;
};

type HookName = keyof HookDataMap;

type HookCallback<T> = T extends void ? () => void : (data: T) => T | undefined | void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHookCallback = (...args: any[]) => any;

const hookListeners: Record<string, AnyHookCallback[]> = {};
const claimedSlots: Set<string> = new Set();

let conversationsStore: ConversationInfo[] = [];
const responsesStore: Record<string, ResponseItem[]> = {};
let modelsStore: ModelInfo[] = [];

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

export function runHook<K extends HookName>(
  eventName: K,
  ...args: HookDataMap[K] extends void ? [] : [HookDataMap[K]]
): HookDataMap[K] extends void ? void : HookDataMap[K] {
  const listeners = hookListeners[eventName];
  if (!listeners || listeners.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return args[0] as any;
  }

  if (eventName === "ready") {
    for (const callback of listeners) {
      callback();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return undefined as any;
  }

  let current = args[0];
  for (const callback of listeners) {
    const result = callback(current);
    if (result !== undefined) {
      current = result;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return current as any;
}

export function isSlotClaimed(slotName: string): boolean {
  return claimedSlots.has(slotName);
}

export function setConversationsStore(conversations: ConversationInfo[]): void {
  conversationsStore = conversations;
}

export function setResponsesStore(conversationId: string, responses: ResponseItem[]): void {
  responsesStore[conversationId] = responses;
}

export function setModelsStore(models: ModelInfo[]): void {
  modelsStore = models;
}

interface LlmApi {
  claim(slotName: string): boolean;
  getMessage(messageId: string): MessageData | null;
  getConversations(): ConversationInfo[];
  getConversation(conversationId: string): ConversationInfo | null;
  getModels(): ModelInfo[];
  on<K extends HookName>(eventName: K, callback: HookCallback<HookDataMap[K]>): void;
}

const llmApi: LlmApi = {
  claim(slotName: string): boolean {
    if (claimedSlots.has(slotName)) {
      return false;
    }
    claimedSlots.add(slotName);
    return true;
  },

  getMessage(messageId: string): MessageData | null {
    for (const responses of Object.values(responsesStore)) {
      for (const item of responses) {
        if (item.id === messageId) {
          const messageData = responseItemToMessageData(item);
          const hookResult = runHook("get_message", { message: messageData });
          return hookResult.message;
        }
      }
    }
    return null;
  },

  getConversations(): ConversationInfo[] {
    return [...conversationsStore];
  },

  getConversation(conversationId: string): ConversationInfo | null {
    return conversationsStore.find((conversation) => conversation.id === conversationId) ?? null;
  },

  getModels(): ModelInfo[] {
    return [...modelsStore];
  },

  on<K extends HookName>(eventName: K, callback: HookCallback<HookDataMap[K]>): void {
    if (!hookListeners[eventName]) {
      hookListeners[eventName] = [];
    }
    hookListeners[eventName].push(callback as AnyHookCallback);
  },
};

declare global {
  interface Window {
    $llm: LlmApi;
  }
  var $llm: LlmApi;
}

export { llmApi };

export type {
  ConversationInfo,
  ResponseItem,
  MessageData,
  ModelInfo,
  GetConversationsHookData,
  GetConversationHookData,
  PostConversationHookData,
  PostConversationMessageHookData,
  StreamEventHookData,
  LlmApi,
};
