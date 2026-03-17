export interface StreamingMessage {
  userPrompt: string;
  assistantContent: string;
  finalized: boolean;
  error: string | null;
}

let streamingMessage: StreamingMessage | null = null;

export function getStreamingMessage(): StreamingMessage | null {
  return streamingMessage;
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
