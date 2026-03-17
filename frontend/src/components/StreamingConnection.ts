import m from "mithril";
import { runHook } from "../hooks";
import {
  appendStreamingDelta,
  finalizeStreamingMessage,
  markStreamingError,
  startStreamingMessage,
} from "../models/StreamingMessage";

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
  }
  activeConversationId = null;
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
      startStreamingMessage(processedEvent.content ?? "");
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
