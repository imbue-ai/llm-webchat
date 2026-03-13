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

let responses: ResponseItem[] = [];
let loading = false;
let loadingError: string | null = null;
let currentConversationId: string | null = null;

export async function fetchResponses(conversationId: string): Promise<void> {
  if (conversationId === currentConversationId) {
    return;
  }
  currentConversationId = conversationId;
  loading = true;
  loadingError = null;
  responses = [];

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
    m("div", { class: "message-role text-xs font-semibold text-text-secondary mb-1" }, responseItem.model),
    m(
      "div",
      { class: "message-content whitespace-pre-wrap text-sm text-text-primary leading-relaxed" },
      responseItem.response,
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

    if (responses.length === 0) {
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

    return m(
      "div",
      { class: "message-list mx-auto w-full max-w-(--width-message-column) flex flex-col py-6" },
      messageNodes,
    );
  },
};
