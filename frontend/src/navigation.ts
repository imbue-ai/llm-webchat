import m from "mithril";

export function getSelectedConversationId(): string | null {
  const attrs = m.route.param("conversationId");
  return attrs ?? null;
}

export function isNewConversationRoute(): boolean {
  return m.route.get() === "/new";
}

export function selectConversation(conversationId: string): void {
  m.route.set("/conversations/:conversationId", { conversationId });
}

export function navigateToNewConversation(): void {
  m.route.set("/new");
}
