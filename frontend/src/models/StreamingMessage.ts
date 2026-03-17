import m from "mithril";
import { runHook } from "../hooks";

export interface StreamingMessage {
  conversationId: string;
  userPrompt: string;
  assistantContent: string;
  finalized: boolean;
  error: string | null;
}

let streamingMessage: StreamingMessage | null = null;

export function getStreamingMessage(conversationId: string): StreamingMessage | null {
  if (streamingMessage !== null && streamingMessage.conversationId === conversationId) {
    return streamingMessage;
  }
  return null;
}

export function startStreamingMessage(conversationId: string, userPrompt: string): void {
  streamingMessage = {
    conversationId,
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

// --- Streaming connection management ---

let activeEventSource: EventSource | null = null;
let activeConversationId: string | null = null;

export function connectToStream(conversationId: string): void {
  if (conversationId === activeConversationId && activeEventSource !== null) {
    return;
  }
  disconnectFromStream();

  activeConversationId = conversationId;
  const eventSource = new EventSource(`/api/conversations/${encodeURIComponent(conversationId)}/stream`);
  activeEventSource = eventSource;

  eventSource.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data) as StreamEvent;
    handleStreamEvent(conversationId, data);
  };

  eventSource.onerror = () => {
    if (eventSource === activeEventSource) {
      disconnectFromStream();
      setTimeout(() => {
        if (activeConversationId === null && conversationId) {
          connectToStream(conversationId);
        }
      }, 3000);
    }
  };
}

export function disconnectFromStream(): void {
  if (activeEventSource !== null) {
    activeEventSource.close();
    activeEventSource = null;
    activeConversationId = null;
    // The streaming message was driven by this EventSource. With the
    // connection closed, it will never receive message_end and would
    // linger as stale state. Clear it so that returning to the
    // conversation later triggers a fresh fetch instead of showing
    // orphaned partial content.
    clearStreamingMessage();
  }
}

interface StreamEventUserMessage {
  type: "user_message";
  content: string;
}

interface StreamEventMessageStart {
  type: "message_start";
}

interface StreamEventMessageDelta {
  type: "message_delta";
  content: string;
}

interface StreamEventMessageEnd {
  type: "message_end";
}

interface StreamEventError {
  type: "error";
  content: string;
}

type StreamEvent =
  | StreamEventUserMessage
  | StreamEventMessageStart
  | StreamEventMessageDelta
  | StreamEventMessageEnd
  | StreamEventError;

function handleStreamEvent(conversationId: string, event: StreamEvent): void {
  const hookResult = runHook("stream_event", {
    conversationId,
    event: {
      type: event.type,
      content: "content" in event ? event.content : undefined,
    },
  });

  const processedEvent = hookResult.event;

  switch (processedEvent.type) {
    case "user_message":
      startStreamingMessage(conversationId, processedEvent.content ?? "");
      break;
    case "message_start":
      break;
    case "message_delta":
      appendStreamingDelta(processedEvent.content ?? "");
      break;
    case "message_end":
      finalizeStreamingMessage();
      break;
    case "error":
      markStreamingError(processedEvent.content ?? "Unknown error");
      break;
  }
  m.redraw();
}
