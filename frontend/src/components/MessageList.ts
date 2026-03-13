import m from "mithril";

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

interface ResponseListResponse {
  responses: ResponseItem[];
}

interface StreamingMessage {
  userPrompt: string;
  assistantContent: string;
  finalized: boolean;
}

let responses: ResponseItem[] = [];
let loading = false;
let loadingError: string | null = null;
let currentConversationId: string | null = null;
let streamingMessage: StreamingMessage | null = null;

export async function fetchResponses(conversationId: string): Promise<void> {
  if (conversationId === currentConversationId) {
    return;
  }
  currentConversationId = conversationId;
  loading = true;
  loadingError = null;
  responses = [];
  streamingMessage = null;

  try {
    const result = await m.request<ResponseListResponse>({
      method: "GET",
      url: "/api/conversations/:conversationId/responses",
      params: { conversationId },
    });
    if (conversationId === currentConversationId) {
      responses = result.responses;
      loading = false;
      loadingError = null;
    }
  } catch (error) {
    if (conversationId === currentConversationId) {
      loading = false;
      loadingError = (error as Error).message;
    }
  }
}

export function startStreamingMessage(userPrompt: string): void {
  streamingMessage = {
    userPrompt,
    assistantContent: "",
    finalized: false,
  };
}

export function appendStreamingDelta(content: string): void {
  if (streamingMessage !== null) {
    streamingMessage = {
      ...streamingMessage,
      assistantContent: streamingMessage.assistantContent + content,
    };
  }
}

export function finalizeStreamingMessage(): void {
  if (streamingMessage !== null) {
    streamingMessage = {
      ...streamingMessage,
      finalized: true,
    };
  }
}

export function refetchCurrentConversation(): void {
  const conversationId = currentConversationId;
  if (conversationId !== null) {
    currentConversationId = null;
    fetchResponses(conversationId);
  }
}

function renderUserMessage(prompt: string): m.Vnode {
  return m("div", { class: "message message-user flex justify-end mb-4" }, [
    m(
      "div",
      {
        class: "message-user-bubble max-w-[70%] rounded-lg bg-primary/10 px-4 py-3 text-text-primary",
      },
      [
        m("div", { class: "message-role text-xs font-semibold text-primary mb-1" }, "You"),
        m("div", { class: "message-content whitespace-pre-wrap text-sm" }, prompt),
      ],
    ),
  ]);
}

function renderAssistantMessage(responseItem: ResponseItem): m.Vnode {
  return m("div", { class: "message message-assistant flex justify-start mb-4" }, [
    m(
      "div",
      {
        class: "message-assistant-bubble max-w-[70%] rounded-lg bg-surface-secondary px-4 py-3 text-text-primary",
      },
      [
        m("div", { class: "message-role text-xs font-semibold text-text-secondary mb-1" }, responseItem.model),
        m("div", { class: "message-content whitespace-pre-wrap text-sm" }, responseItem.response),
      ],
    ),
  ]);
}

function renderStreamingAssistantMessage(content: string): m.Vnode {
  return m("div", { class: "message message-assistant message-streaming flex justify-start mb-4" }, [
    m(
      "div",
      {
        class: "message-assistant-bubble max-w-[70%] rounded-lg bg-surface-secondary px-4 py-3 text-text-primary",
      },
      [
        m("div", { class: "message-role text-xs font-semibold text-text-secondary mb-1" }, "Assistant"),
        m("div", { class: "message-content whitespace-pre-wrap text-sm" }, content || "…"),
      ],
    ),
  ]);
}

export const MessageList: m.Component<{ conversationId: string | null }> = {
  view(vnode) {
    const conversationId = vnode.attrs.conversationId;

    if (!conversationId) {
      return m(
        "div",
        { class: "message-list-empty flex items-center justify-center h-full" },
        m("p", { class: "text-text-secondary" }, "Select or start a conversation."),
      );
    }

    if (loading) {
      return m(
        "div",
        { class: "message-list-loading flex items-center justify-center h-full" },
        m("p", { class: "text-text-secondary" }, "Loading messages…"),
      );
    }

    if (loadingError) {
      return m(
        "div",
        { class: "message-list-error flex items-center justify-center h-full" },
        m("p", { class: "text-red-500" }, `Error: ${loadingError}`),
      );
    }

    if (responses.length === 0 && streamingMessage === null) {
      return m(
        "div",
        { class: "message-list-empty flex items-center justify-center h-full" },
        m("p", { class: "text-text-secondary" }, "No messages in this conversation."),
      );
    }

    const messageNodes: m.Vnode[] = [];
    for (const responseItem of responses) {
      if (responseItem.prompt !== null && responseItem.prompt !== "") {
        messageNodes.push(renderUserMessage(responseItem.prompt));
      }
      messageNodes.push(renderAssistantMessage(responseItem));
    }

    if (streamingMessage !== null) {
      messageNodes.push(renderUserMessage(streamingMessage.userPrompt));
      messageNodes.push(renderStreamingAssistantMessage(streamingMessage.assistantContent));
    }

    return m("div", { class: "message-list flex flex-col p-4" }, messageNodes);
  },
};
