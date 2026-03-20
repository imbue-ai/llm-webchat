import m from "mithril";
import { isSlotClaimed } from "../slots";
import {
  ConversationNotFoundError,
  appendSyntheticResponse,
  fetchResponses as fetchResponsesFromApi,
  getLastResponseModel,
  getResponsesForConversation,
  isConversationNotFound as isConversationNotFoundInStore,
  type ResponseItem,
} from "../models/Response";
import {
  connectToStream,
  consumeLastFinalizedMessage,
  disconnectFromStream,
  getStreamingMessage,
  type StreamingMessage,
} from "../models/StreamingMessage";
import { getConversations } from "../models/Conversation";
import { renderMarkdown } from "../markdown";
import { EmptySlot } from "./EmptySlot";
import { MessageInput, setSelectedModelId } from "./MessageInput";

const SCROLL_BOTTOM_THRESHOLD_PX = 40;
const SCROLL_TO_USER_MESSAGE_OFFSET_PX = 40;

function measureContentAfterLastUserMessage(wrapper: HTMLElement, spacerElement: HTMLElement): number {
  const userMessages = wrapper.querySelectorAll(".message-user");
  const lastUserMessage = userMessages.length > 0 ? (userMessages[userMessages.length - 1] as HTMLElement) : null;
  if (lastUserMessage === null) {
    return 0;
  }

  const lastUserMessageBottom = lastUserMessage.offsetTop + lastUserMessage.offsetHeight;
  const spacerTop = spacerElement.offsetTop;
  return Math.max(0, spacerTop - lastUserMessageBottom);
}

function updateSpacerHeight(spacerElement: HTMLElement): void {
  const scrollContainer = spacerElement.closest(".app-content") as HTMLElement | null;
  if (scrollContainer === null) {
    return;
  }

  const wrapper = spacerElement.closest(".message-list-wrapper") as HTMLElement | null;
  if (wrapper === null) {
    return;
  }

  const userMessages = wrapper.querySelectorAll(".message-user");
  const lastUserMessage = userMessages.length > 0 ? (userMessages[userMessages.length - 1] as HTMLElement) : null;
  const lastUserMessageHeight = lastUserMessage !== null ? lastUserMessage.offsetHeight : 0;

  const contentAfterUserMessage = measureContentAfterLastUserMessage(wrapper, spacerElement);
  const reservedHeight = lastUserMessageHeight + contentAfterUserMessage + SCROLL_TO_USER_MESSAGE_OFFSET_PX;
  const spacerHeight = Math.max(0, scrollContainer.clientHeight - reservedHeight);
  spacerElement.style.height = `${spacerHeight}px`;
}

function scrollToLastUserMessage(spacerElement: HTMLElement): void {
  const scrollContainer = spacerElement.closest(".app-content") as HTMLElement | null;
  if (scrollContainer === null) {
    return;
  }

  const wrapper = spacerElement.closest(".message-list-wrapper") as HTMLElement | null;
  if (wrapper === null) {
    return;
  }

  const userMessages = wrapper.querySelectorAll(".message-user");
  const lastUserMessage = userMessages.length > 0 ? (userMessages[userMessages.length - 1] as HTMLElement) : null;
  if (lastUserMessage !== null) {
    const targetScrollTop = lastUserMessage.offsetTop - scrollContainer.offsetTop - SCROLL_TO_USER_MESSAGE_OFFSET_PX;
    scrollContainer.scrollTop = Math.max(0, targetScrollTop);
  }
}

function getHashTargetId(): string | null {
  const hash = window.location.hash;
  return hash.length > 1 ? hash.slice(1) : null;
}

function scrollToHashTarget(): boolean {
  const hashTargetId = getHashTargetId();
  if (hashTargetId === null) {
    return false;
  }

  const element = document.getElementById(hashTargetId);
  if (element === null) {
    return false;
  }

  element.scrollIntoView({ behavior: "auto", block: "center" });
  return true;
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
}

function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

function getConversationName(conversationId: string | null): string {
  if (!conversationId) {
    return "";
  }
  const conversations = getConversations();
  const conversation = conversations.find((c) => c.id === conversationId);
  return conversation?.name || "Untitled conversation";
}

function getConversationModel(conversationId: string | null): string {
  if (!conversationId) {
    return "";
  }
  const conversations = getConversations();
  const conversation = conversations.find((c) => c.id === conversationId);
  return conversation?.model || "";
}

function renderUserMessage(prompt: string): m.Vnode {
  return m("div", { class: "message message-user" }, [
    m("div", { class: "message-user-bubble" }, [m("div", { class: "message-content whitespace-pre-wrap" }, prompt)]),
  ]);
}

function renderAssistantMessage(responseItem: ResponseItem): m.Vnode {
  const messageClaimed = isSlotClaimed("message");
  return m(
    "div",
    {
      id: responseItem.id,
      class: "message message-assistant",
      "data-slot": "message",
      "data-message-id": responseItem.id,
    },
    messageClaimed
      ? null
      : [m("div", { class: "message-content markdown-content" }, m.trust(renderMarkdown(responseItem.response)))],
  );
}

function renderStreamingIndicator(): m.Vnode {
  return m("div", { class: "streaming-indicator inline-flex items-center gap-2 mt-4" }, [
    m("span", { class: "streaming-dot streaming-dot-1 w-2 h-2 rounded-full bg-accent" }),
    m("span", { class: "streaming-dot streaming-dot-2 w-2 h-2 rounded-full bg-accent" }),
    m("span", { class: "streaming-dot streaming-dot-3 w-2 h-2 rounded-full bg-accent" }),
  ]);
}

function renderStreamingAssistantMessage(content: string): m.Vnode {
  const hasContent = content.length > 0;
  return m("div", { class: "message message-assistant message-streaming" }, [
    hasContent
      ? m("div", { class: "message-content markdown-content" }, m.trust(renderMarkdown(content)))
      : renderStreamingIndicator(),
  ]);
}

function renderErrorMessage(errorContent: string, partialAssistantContent: string): m.Vnode {
  const children: m.Children[] = [];
  if (partialAssistantContent) {
    children.push(
      m("div", { class: "message-content markdown-content mb-3" }, m.trust(renderMarkdown(partialAssistantContent))),
    );
  }
  children.push(
    m(
      "div",
      {
        class:
          "message-error-banner flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700",
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
  let previousScrollTop = 0;
  let previousLocationHash = window.location.hash;
  let userSubmittedInSession = false;
  let pendingScrollToUserMessage = false;

  async function fetchConversation(conversationId: string): Promise<void> {
    loading = true;
    loadingError = null;

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
    if (modelSyncedForConversation === conversationId) {
      return;
    }

    const lastModel = getLastResponseModel(conversationId);
    const modelToSync = lastModel || getConversationModel(conversationId);
    if (modelToSync) {
      setSelectedModelId(modelToSync);
      modelSyncedForConversation = conversationId;
    }
  }

  function syncHashScrollState(): void {
    const currentLocationHash = window.location.hash;
    if (currentLocationHash === previousLocationHash) {
      return;
    }

    previousLocationHash = currentLocationHash;
    if (getHashTargetId() !== null) {
      pendingHashScroll = true;
      userScrolledUp = true;
    }
  }

  function ensureConversationLoaded(conversationId: string): void {
    if (conversationId === currentConversationId) {
      syncModelSelection(conversationId);
      return;
    }

    currentConversationId = conversationId;
    modelSyncedForConversation = null;
    previousScrollTop = 0;
    pendingHashScroll = getHashTargetId() !== null;
    userScrolledUp = pendingHashScroll;

    if (getStreamingMessage(conversationId) !== null) {
      loading = false;
      loadingError = null;
      return;
    }

    fetchConversation(conversationId);
  }

  function applyScrollPosition(element: HTMLElement): void {
    if (pendingHashScroll) {
      if (!loading && scrollToHashTarget()) {
        pendingHashScroll = false;
        previousScrollTop = element.scrollTop;
      }
      return;
    }

    if (!userScrolledUp) {
      scrollToBottom(element);
      previousScrollTop = element.scrollTop;
    }
  }

  function handleScrollEvent(event: Event): void {
    const element = event.target as HTMLElement;
    const currentScrollTop = element.scrollTop;
    const didScrollUp = currentScrollTop < previousScrollTop;

    previousScrollTop = currentScrollTop;

    if (didScrollUp) {
      userScrolledUp = true;
      return;
    }

    if (isNearBottom(element)) {
      userScrolledUp = false;
    }
  }

  function handleHashChange(): void {
    syncHashScrollState();
    m.redraw();
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

    const shouldScroll = pendingScrollToUserMessage;
    const spacer = userSubmittedInSession
      ? m("div", {
          class: "message-list-scroll-spacer",
          oncreate: (spacerVnode: m.VnodeDOM) => {
            const element = spacerVnode.dom as HTMLElement;
            updateSpacerHeight(element);
            if (shouldScroll) {
              scrollToLastUserMessage(element);
              pendingScrollToUserMessage = false;
            }
          },
          onupdate: (spacerVnode: m.VnodeDOM) => {
            const element = spacerVnode.dom as HTMLElement;
            updateSpacerHeight(element);
            if (shouldScroll) {
              scrollToLastUserMessage(element);
              pendingScrollToUserMessage = false;
            }
          },
        })
      : null;

    return m("div", { class: "message-list-wrapper" }, [
      m(
        "div",
        { class: "message-list mx-auto w-full max-w-(--width-message-column) flex flex-col py-6" },
        messageNodes,
      ),
      spacer,
    ]);
  }

  return {
    oncreate() {
      window.addEventListener("hashchange", handleHashChange);
    },

    onremove() {
      window.removeEventListener("hashchange", handleHashChange);
    },

    view(vnode) {
      syncHashScrollState();

      const conversationId = vnode.attrs.conversationId;

      const currentStreamingMessage = conversationId !== null ? getStreamingMessage(conversationId) : null;
      if (previousStreamingMessage === null && currentStreamingMessage !== null) {
        userSubmittedInSession = true;
        pendingScrollToUserMessage = true;
      }
      if (previousStreamingMessage !== null && currentStreamingMessage === null) {
        const finalizedMessage = consumeLastFinalizedMessage();
        if (finalizedMessage !== null) {
          appendSyntheticResponse(
            finalizedMessage.conversationId,
            finalizedMessage.userPrompt,
            finalizedMessage.assistantContent,
            finalizedMessage.model,
          );
        }
      }
      previousStreamingMessage = currentStreamingMessage;
      manageStreamConnection(conversationId);
      const conversationIsNotFound = conversationId !== null && isConversationNotFoundInStore(conversationId);
      const showFooter = conversationId === null || !conversationIsNotFound;

      const conversationName = getConversationName(conversationId);
      const conversationModel = getConversationModel(conversationId);

      const titleBar = conversationId
        ? m(
            "header",
            {
              class: "app-header",
              "data-slot": "header",
            },
            isSlotClaimed("header")
              ? null
              : [
                  m("h1", { class: "app-header-title" }, conversationName),
                  conversationModel ? m("span", { class: "app-header-model-badge" }, conversationModel) : null,
                ],
          )
        : null;

      const footerElement = showFooter
        ? m(
            "footer",
            { class: "app-footer", "data-slot": "conversation-footer" },
            isSlotClaimed("conversation-footer")
              ? null
              : [m(EmptySlot, { name: "conversation-before-input" }), m(MessageInput, { conversationId })],
          )
        : null;

      return m("div", { class: "app-content-wrapper flex-1 flex flex-col min-h-0" }, [
        titleBar,
        m(
          "main",
          {
            class: "app-content flex-1 overflow-y-auto px-8 py-6",
            "data-slot": "conversation-content",
            onscroll: handleScrollEvent,
            oncreate: (mainVnode: m.VnodeDOM) => {
              applyScrollPosition(mainVnode.dom as HTMLElement);
            },
            onupdate: (mainVnode: m.VnodeDOM) => {
              applyScrollPosition(mainVnode.dom as HTMLElement);
            },
          },
          isSlotClaimed("conversation-content") ? null : renderMainContent(conversationId),
        ),
        footerElement,
      ]);
    },
  };
}
