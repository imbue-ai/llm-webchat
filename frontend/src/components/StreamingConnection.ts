import m from "mithril";
import { appendStreamingDelta, finalizeStreamingMessage, startStreamingMessage } from "./MessageList";

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
    handleStreamEvent(data);
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

function handleStreamEvent(event: StreamEvent): void {
  switch (event.type) {
    case "user_message":
      startStreamingMessage(event.content);
      break;
    case "message_start":
      break;
    case "message_delta":
      appendStreamingDelta(event.content);
      break;
    case "message_end":
      finalizeStreamingMessage();
      break;
    case "error":
      appendStreamingDelta(`\n[Error: ${event.content}]`);
      finalizeStreamingMessage();
      break;
  }
  m.redraw();
}
