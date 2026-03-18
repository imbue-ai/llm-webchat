import m from "mithril";
import { isSlotClaimed } from "../slots";
import {
  ConversationNotFoundError,
  fetchResponses as fetchResponsesFromApi,
  getLastResponseModel,
  getResponsesForConversation,
  isConversationNotFound as isConversationNotFoundInStore,
  type ResponseItem,
} from "../models/Response";
import {
  connectToStream,
  disconnectFromStream,
  getStreamingMessage,
  type StreamingMessage,
} from "../models/StreamingMessage";
import { renderMarkdown } from "../markdown";
import { EmptySlot } from "./EmptySlot";
import { MessageInput, setSelectedModelId } from "./MessageInput";

const SCROLL_BOTTOM_THRESHOLD_PX = 40;

function scrollToHashTarget(): void {
  const hash = window.location.hash;
  if (!hash) {
    return;
  }
  const element = document.getElementById(hash.slice(1));
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
}

function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
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

export function MessageList(): m.Component<{ conversationId: string | null }> {
  let loading = false;
  let loadingError: string | null = null;
  let currentConversationId: string | null = null;
  let pendingHashScroll = false;
  let previousStreamingMessage: StreamingMessage | null = null;
  let userScrolledUp = false;
  let modelSyncedForConversation: string | null = null;

  async function fetchConversation(conversationId: string): Promise<void> {
    loading = true;
    loadingError = null;
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
        if (!(error instanceof ConversationNotFoundError)) {
          loadingError = (error as Error).message ?? String(error);
        }
      }
    }
  }

  function manageStreamConnection(conversationId: string | null): void {
    if (conversationId !== null) {
      if (!isConversationNotFoundInStore(conversationId)) {
        connectToStream(conversationId);
      } else {
        disconnectFromStream();
      }
    } else if (currentConversationId !== null) {
      disconnectFromStream();
    }
  }

  function syncModelSelection(conversationId: string): void {
    // If there's a streaming message with a known model, always prefer it –
    // this covers the case where the user changed the model, sent a message,
    // navigated away, and came back while the response is still streaming.
    const streamingMsg = getStreamingMessage(conversationId);
    if (streamingMsg?.model) {
      setSelectedModelId(streamingMsg.model);
      modelSyncedForConversation = conversationId;
      return;
    }

    if (modelSyncedForConversation === conversationId) {
      return;
    }
    const lastModel = getLastResponseModel(conversationId);
    if (lastModel) {
      setSelectedModelId(lastModel);
      modelSyncedForConversation = conversationId;
    }
  }

  function ensureConversationLoaded(conversationId: string): void {
    if (conversationId === currentConversationId) {
      syncModelSelection(conversationId);
      return;
    }

    const previousId = currentConversationId;
    currentConversationId = conversationId;
    modelSyncedForConversation = null;

    // Reset scroll state on conversation change
    if (previousId !== null) {
      userScrolledUp = window.location.hash.length > 1;
    }

    // When a streaming message is already in progress for this conversation
    // (e.g. after creating a new conversation), skip the fetch — the data
    // will be fetched once streaming finalises.
    if (getStreamingMessage(conversationId) !== null) {
      loading = false;
      loadingError = null;
      return;
    }

    fetchConversation(conversationId);
  }

  function handleScrollEvent(event: Event): void {
    const element = event.target as HTMLElement;
    userScrolledUp = !isNearBottom(element);
  }

  function renderMainContent(conversationId: string | null): m.Vnode {
    if (!conversationId) {
      return m(
        "div",
        { class: "message-list-empty flex items-center justify-center h-full" },
        m("p", { class: "text-text-secondary" }, "Select or start a conversation."),
      );
    }

    ensureConversationLoaded(conversationId);

    if (isConversationNotFoundInStore(conversationId)) {
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
    const streamingMessage = getStreamingMessage(conversationId);

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
  }

  return {
    onupdate() {
      if (pendingHashScroll && !loading) {
        scrollToHashTarget();
        pendingHashScroll = false;
      }

      // When streaming finishes (message goes from non-null to null without
      // error), refetch to pick up the persisted response from the server.
      const currentStreamingMessage =
        currentConversationId !== null ? getStreamingMessage(currentConversationId) : null;
      if (previousStreamingMessage !== null && currentStreamingMessage === null) {
        if (currentConversationId !== null) {
          fetchConversation(currentConversationId);
        }
      }
      previousStreamingMessage = currentStreamingMessage;
    },

    view(vnode) {
      const conversationId = vnode.attrs.conversationId;
      manageStreamConnection(conversationId);
      const conversationIsNotFound = conversationId !== null && isConversationNotFoundInStore(conversationId);
      const showFooter = conversationId === null || !conversationIsNotFound;

      const footerElement = showFooter
        ? m(
            "footer",
            { class: "app-footer border-t border-border px-6 py-3", "data-slot": "conversation-footer" },
            isSlotClaimed("conversation-footer")
              ? null
              : [
                  m(EmptySlot, { name: "conversation-before-input" }),
                  m(MessageInput, { conversationId }),
                ],
          )
        : null;

      return m("div", { class: "app-content-wrapper flex-1 flex flex-col min-h-0" }, [
        m(
          "main",
          {
            class: "app-content flex-1 overflow-y-auto p-6",
            "data-slot": "conversation-content",
            onscroll: handleScrollEvent,
            oncreate: (mainVnode: m.VnodeDOM) => {
              scrollToBottom(mainVnode.dom as HTMLElement);
            },
            onupdate: (mainVnode: m.VnodeDOM) => {
              if (!userScrolledUp) {
                scrollToBottom(mainVnode.dom as HTMLElement);
              }
            },
          },
          isSlotClaimed("conversation-content") ? null : renderMainContent(conversationId),
        ),
        footerElement,
      ]);
    },
  };
}
