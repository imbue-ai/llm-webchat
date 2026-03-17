import m from "mithril";
import { isSlotClaimed } from "../slots";
import {
  ConversationNotFoundError,
  fetchResponses as fetchResponsesFromApi,
  getResponsesForConversation,
  type ResponseItem,
  getLastResponseModel as getLastResponseModelFromStore,
} from "../models/Response";
import { getStreamingMessage } from "../models/StreamingMessage";
import { renderMarkdown } from "../components/renderMarkdown";

let loading = false;
let loadingError: string | null = null;
let conversationNotFound = false;
let currentConversationId: string | null = null;
let pendingHashScroll = false;
let previousStreamingMessage: unknown = null;

export function isConversationNotFound(): boolean {
  return conversationNotFound;
}

export function getLastResponseModel(): string | null {
  if (currentConversationId === null) {
    return null;
  }
  return getLastResponseModelFromStore(currentConversationId);
}

export function refetchCurrentConversation(): void {
  const conversationId = currentConversationId;
  if (conversationId !== null) {
    currentConversationId = null;
    loadConversation(conversationId);
  }
}

export async function loadConversation(conversationId: string): Promise<void> {
  if (conversationId === currentConversationId) {
    return;
  }
  currentConversationId = conversationId;
  loading = true;
  loadingError = null;
  conversationNotFound = false;
  pendingHashScroll = window.location.hash.length > 1;

  try {
    await fetchResponsesFromApi(conversationId);
    if (conversationId === currentConversationId) {
      loading = false;
      loadingError = null;
    }
  } catch (error) {
    if (conversationId === currentConversationId) {
      loading = false;
      if (error instanceof ConversationNotFoundError) {
        conversationNotFound = true;
      } else {
        loadingError = (error as Error).message ?? String(error);
      }
    }
  }
}

function scrollToHashTarget(): void {
  const hash = window.location.hash;
  if (!hash) {
    return;
  }
  const element = document.getElementById(hash.slice(1));
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    pendingHashScroll = false;
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
  const messageClaimed = isSlotClaimed("message");
  return m(
    "div",
    {
      id: responseItem.id,
      class: "message message-assistant mb-6",
      "data-slot": "message",
      "data-message-id": responseItem.id,
    },
    messageClaimed
      ? null
      : [
          m(
            "div",
            {
              class: "message-content markdown-content text-sm text-text-primary leading-relaxed",
            },
            m.trust(renderMarkdown(responseItem.response)),
          ),
        ],
  );
}

function renderStreamingIndicator(): m.Vnode {
  return m("div", { class: "streaming-indicator inline-flex items-center gap-2 mt-4" }, [
    m("span", { class: "streaming-dot streaming-dot-1 w-2 h-2 rounded-full bg-text-secondary" }),
    m("span", { class: "streaming-dot streaming-dot-2 w-2 h-2 rounded-full bg-text-secondary" }),
    m("span", { class: "streaming-dot streaming-dot-3 w-2 h-2 rounded-full bg-text-secondary" }),
  ]);
}

function renderStreamingAssistantMessage(content: string): m.Vnode {
  const hasContent = content.length > 0;
  return m("div", { class: "message message-assistant message-streaming mb-6" }, [
    hasContent
      ? m(
          "div",
          {
            class: "message-content markdown-content text-sm text-text-primary leading-relaxed",
          },
          m.trust(renderMarkdown(content)),
        )
      : renderStreamingIndicator(),
  ]);
}

function renderErrorMessage(errorContent: string, partialAssistantContent: string): m.Vnode {
  const children: m.Children[] = [];
  if (partialAssistantContent) {
    children.push(
      m(
        "div",
        {
          class: "message-content markdown-content text-sm text-text-primary mb-3",
        },
        m.trust(renderMarkdown(partialAssistantContent)),
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
  onupdate() {
    if (pendingHashScroll && !loading) {
      scrollToHashTarget();
    }

    // When streaming finishes (message goes from non-null to null without
    // error), refetch to pick up the persisted response from the server.
    const currentStreamingMessage = getStreamingMessage();
    if (previousStreamingMessage !== null && currentStreamingMessage === null) {
      refetchCurrentConversation();
    }
    previousStreamingMessage = currentStreamingMessage;
  },
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

    const responses = getResponsesForConversation(conversationId);
    const streamingMessage = getStreamingMessage();

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
