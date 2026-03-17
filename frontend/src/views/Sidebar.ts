import m from "mithril";
import { isSlotClaimed } from "../slots";
import { navigateToNewConversation } from "../navigation";
import { ConversationSelector } from "./ConversationSelector";

const ICON_PANEL_LEFT_CLOSE = '<path d="M3 3h18v18H3z"/><path d="M9 3v18"/><path d="M14 9l-3 3 3 3"/>';
const ICON_PANEL_LEFT_OPEN = '<path d="M3 3h18v18H3z"/><path d="M9 3v18"/><path d="M14 9l3 3-3 3"/>';
const ICON_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';

let collapsed = false;

function toggle(): void {
  collapsed = !collapsed;
}

function iconButton(label: string, onclick: () => void, svgPath: string): m.Vnode {
  return m(
    "button",
    {
      class: "sidebar-icon-button",
      onclick,
      "aria-label": label,
      title: label,
    },
    m.trust(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`,
    ),
  );
}

export const Sidebar: m.Component = {
  view() {
    const sidebarClass = [
      "app-sidebar border-r border-border bg-surface-secondary p-4",
      collapsed ? "app-sidebar--collapsed" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (isSlotClaimed("sidebar")) {
      return m("aside", { class: sidebarClass, "data-slot": "sidebar" });
    }

    const collapsedRail = m("div", { class: "sidebar-collapsed-content" }, [
      iconButton("Expand sidebar", toggle, ICON_PANEL_LEFT_OPEN),
      iconButton("New conversation", navigateToNewConversation, ICON_PLUS),
    ]);

    const collapseButton = iconButton("Collapse sidebar", toggle, ICON_PANEL_LEFT_CLOSE);

    const expandedContent = m("div", { class: "sidebar-expanded-content flex flex-col flex-1 min-h-0" }, [
      m(ConversationSelector, { collapseButton }),
    ]);

    return m("aside", { class: sidebarClass, "data-slot": "sidebar" }, [collapsedRail, expandedContent]);
  },
};
