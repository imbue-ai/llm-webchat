import m from "mithril";
import { isSlotClaimed, getSlotRenderCallback } from "../slots";
import { runHook } from "../hooks";
import { navigateToNewConversation } from "../navigation";
import { ConversationSelector } from "./ConversationSelector";
import { getSidebarItems } from "../sidebar-items";
import type { SidebarItemDefinition } from "../sidebar-items";

function invokeSlotRendered(slotName: string, container: HTMLElement): void {
  const renderCallback = getSlotRenderCallback(slotName);
  if (renderCallback) {
    renderCallback(container);
  }
  runHook("slot_rendered", { slotName, container });
}

const ICON_PANEL_LEFT_CLOSE = '<path d="M3 3h18v18H3z"/><path d="M9 3v18"/><path d="M16 9l-3 3 3 3"/>';
const ICON_PANEL_LEFT_OPEN = '<path d="M3 3h18v18H3z"/><path d="M9 3v18"/><path d="M14 9l3 3-3 3"/>';
const ICON_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

let collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";

function toggle(): void {
  collapsed = !collapsed;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
}

function sidebarItemIcon(item: SidebarItemDefinition): m.Vnode {
  return m(
    "button",
    {
      class: "sidebar-icon-button",
      onclick() {
        m.route.set(item.route);
      },
      "aria-label": item.name,
      title: item.name,
    },
    m.trust(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>`,
    ),
  );
}

function sidebarItemRow(item: SidebarItemDefinition): m.Vnode {
  return m("div", { class: "sidebar-item-row" }, [
    m(
      "a",
      {
        class: "sidebar-item-link",
        href: "javascript:void(0)",
        onclick(event: Event) {
          event.preventDefault();
          m.route.set(item.route);
        },
      },
      [
        m.trust(
          `<svg class="sidebar-item-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>`,
        ),
        m("span", { class: "sidebar-item-label" }, item.name),
      ],
    ),
  ]);
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
    const sidebarClass = ["app-sidebar", collapsed ? "app-sidebar--collapsed" : ""].filter(Boolean).join(" ");

    if (isSlotClaimed("sidebar")) {
      return m("aside", {
        class: sidebarClass,
        "data-slot": "sidebar",
        oncreate(vnode: m.VnodeDOM) {
          invokeSlotRendered("sidebar", vnode.dom as HTMLElement);
        },
      });
    }

    return m("aside", { class: sidebarClass, "data-slot": "sidebar" }, [
      m("div", { class: "sidebar-collapsed-content" }, [
        iconButton("Expand sidebar", toggle, ICON_PANEL_LEFT_OPEN),
        ...getSidebarItems().map(sidebarItemIcon),
        iconButton("New conversation", navigateToNewConversation, ICON_PLUS),
      ]),
      m("div", { class: "sidebar-expanded-content flex flex-col flex-1 min-h-0" }, [
        m(
          "div",
          {
            "data-slot": "sidebar-header",
            oncreate(vnode: m.VnodeDOM) {
              if (isSlotClaimed("sidebar-header")) {
                invokeSlotRendered("sidebar-header", vnode.dom as HTMLElement);
              }
            },
          },
          isSlotClaimed("sidebar-header")
            ? null
            : [
                m("div", { class: "sidebar-branding-row" }, [
                  m(
                    "div",
                    {
                      class: "sidebar-branding",
                      "data-slot": "sidebar-branding",
                      oncreate(vnode: m.VnodeDOM) {
                        if (isSlotClaimed("sidebar-branding")) {
                          invokeSlotRendered("sidebar-branding", vnode.dom as HTMLElement);
                        }
                      },
                      onbeforeupdate() {
                        return !isSlotClaimed("sidebar-branding");
                      },
                    },
                    isSlotClaimed("sidebar-branding")
                      ? null
                      : m("span", { class: "sidebar-branding-title" }, "LLM Webchat"),
                  ),
                  iconButton("Collapse sidebar", toggle, ICON_PANEL_LEFT_CLOSE),
                ]),
                ...getSidebarItems().map(sidebarItemRow),
                m("div", { class: "sidebar-new-conversation-row" }, [
                  m("span", { class: "sidebar-new-conversation-label" }, "New conversation"),
                  iconButton("New conversation", navigateToNewConversation, ICON_PLUS),
                ]),
              ],
        ),
        m(ConversationSelector),
      ]),
    ]);
  },
};
