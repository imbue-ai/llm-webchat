import m from "mithril";
import { isSlotClaimed } from "../slots";
import { fetchConversations, getConversations, getLoadingError, type Conversation } from "../models/Conversation";
import { getSelectedConversationId, selectConversation } from "../navigation";
import { EmptySlot } from "./EmptySlot";

function formatRelativeTimestamp(datetimeUtc: string | null): string {
  if (datetimeUtc === null || datetimeUtc === "") {
    return "";
  }

  const hasTimezone = /Z|[+-]\d{2}:\d{2}$/.test(datetimeUtc);
  const date = new Date(hasTimezone ? datetimeUtc : datetimeUtc + "Z");
  const now = new Date();
  const diffMilliseconds = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMilliseconds / 60000);
  const diffHours = Math.floor(diffMilliseconds / 3600000);
  const diffDays = Math.floor(diffMilliseconds / 86400000);

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderConversationItem(conversation: Conversation, isActive: boolean, isClaimed: boolean): m.Vnode {
  const itemClass = ["conversation-selector-item", isActive ? "conversation-selector-item--active" : ""]
    .filter(Boolean)
    .join(" ");

  return m(
    "li",
    {
      key: conversation.id,
      class: itemClass,
      "data-slot": "conversation-selector-item",
      "data-conversation-id": conversation.id,
      onclick: () => selectConversation(conversation.id),
    },
    isClaimed
      ? null
      : [
          m("div", { class: "conversation-selector-item-name" }, conversation.name || "Untitled conversation"),
          m("div", { class: "conversation-selector-item-meta" }, [
            m("span", { class: "conversation-selector-item-model" }, conversation.model),
            conversation.latest_response_datetime_utc
              ? m(
                  "span",
                  { class: "conversation-selector-item-time" },
                  formatRelativeTimestamp(conversation.latest_response_datetime_utc),
                )
              : null,
          ]),
        ],
  );
}

export const ConversationSelector: m.Component = {
  oninit() {
    fetchConversations();
  },
  view() {
    const currentConversationId = getSelectedConversationId();
    const conversations = getConversations();
    const loadingError = getLoadingError();
    const conversationSelectorItemClaimed = isSlotClaimed("conversation-selector-item");

    return m(
      "div",
      { class: "conversation-selector flex flex-col flex-1 min-h-0", "data-slot": "conversation-selector" },
      [
        m(EmptySlot, { name: "sidebar-before-list" }),
        loadingError
          ? m("p", { class: "conversation-selector-error mt-2 text-sm text-red-500" }, `Error: ${loadingError}`)
          : conversations.length === 0
            ? m(
                "p",
                { class: "conversation-selector-empty mt-2 px-5 text-sm text-text-secondary" },
                "No conversations yet.",
              )
            : m(
                "div",
                { class: "conversation-selector-list-wrapper flex-1 overflow-y-auto" },
                m(
                  "ul",
                  { class: "conversation-selector-list" },
                  conversations.map((conversation) =>
                    renderConversationItem(
                      conversation,
                      conversation.id === currentConversationId,
                      conversationSelectorItemClaimed,
                    ),
                  ),
                ),
              ),
      ],
    );
  },
};
