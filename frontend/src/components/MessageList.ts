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
  error: string | null;
}

let responses: ResponseItem[] = [];
let loading = false;
let loadingError: string | null = null;
let conversationNotFound = false;
let currentConversationId: string | null = null;
let streamingMessage: StreamingMessage | null = null;

export async function fetchResponses(conversationId: string): Promise<void> {
  if (conversationId === currentConversationId) {
    return;
  }
  currentConversationId = conversationId;
  loading = true;
  loadingError = null;
  conversationNotFound = false;
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
      const requestError = error as { code?: number; message?: string };
      if (requestError.code === 404) {
        conversationNotFound = true;
      } else {
        loadingError = requestError.message ?? String(error);
      }
    }
  }
}

export function startStreamingMessage(userPrompt: string): void {
  streamingMessage = {
    userPrompt,
    assistantContent: "",
    finalized: false,
    error: null,
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
  if (streamingMessage !== null && streamingMessage.error === null) {
    streamingMessage = null;
    refetchCurrentConversation();
  }
}

export function markStreamingError(errorContent: string): void {
  if (streamingMessage !== null) {
    streamingMessage = {
      ...streamingMessage,
      finalized: true,
      error: errorContent,
    };
  }
}

export function clearStreamingMessage(): void {
  streamingMessage = null;
}

export function isStreaming(): boolean {
  return streamingMessage !== null && !streamingMessage.finalized;
}

export function isConversationNotFound(): boolean {
  return conversationNotFound;
}

export function getLastResponseModel(): string | null {
  if (responses.length === 0) {
    return null;
  }
  const model = responses[responses.length - 1].model;
  return model || null;
}

export function refetchCurrentConversation(): void {
  const conversationId = currentConversationId;
  if (conversationId !== null) {
    currentConversationId = null;
    fetchResponses(conversationId);
  }
}

function renderUserMessage(prompt: string): m.Vnode {
  return m("div", { class: "message message-user flex justify-end mb-6" }, [
    m(
      "div",
      {
        class: "message-user-bubble max-w-[85%] rounded-3xl bg-user-bubble-bg px-5 py-3 text-user-bubble-text",
      },
      [m("div", { class: "message-content whitespace-pre-wrap text-sm" }, prompt)],
    ),
  ]);
}

function renderAssistantMessage(responseItem: ResponseItem): m.Vnode {
  return m("div", { class: "message message-assistant mb-6" }, [
    m(
      "div",
      { class: "message-content whitespace-pre-wrap text-sm text-text-primary leading-relaxed" },
      responseItem.response,
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

function renderErrorMessage(errorContent: string, partialAssistantContent: string): m.Vnode {
  const children: m.Children[] = [];
  if (partialAssistantContent) {
    children.push(
      m(
        "div",
        { class: "message-content whitespace-pre-wrap text-sm text-text-primary mb-3" },
        partialAssistantContent,
      ),
    );
  }
  children.push(
    m(
      "div",
      {
        class:
          "message-error-banner flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300",
      },
      [m("span", { class: "message-error-icon" }, "⚠"), m("span", errorContent)],
    ),
  );
  return m("div", { class: "message message-error mb-6" }, children);
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

    if (conversationNotFound) {
      return m("div", { class: "message-list-not-found flex flex-col items-center justify-center h-full gap-2" }, [
        m("p", { class: "text-2xl font-semibold text-text-primary" }, "404"),
        m("p", { class: "text-text-secondary" }, "Conversation not found."),
      ]);
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
      if (streamingMessage.error !== null) {
        messageNodes.push(renderErrorMessage(streamingMessage.error, streamingMessage.assistantContent));
      } else {
        messageNodes.push(renderStreamingAssistantMessage(streamingMessage.assistantContent));
      }
    }

    return m(
      "div",
      { class: "message-list mx-auto w-full max-w-(--width-message-column) flex flex-col py-6" },
      messageNodes,
    );
  },
};
