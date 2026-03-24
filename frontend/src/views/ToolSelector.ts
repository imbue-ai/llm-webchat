import m from "mithril";
import { fetchTools, getTools } from "../models/Tool";

interface ToolSelectorAttributes {
  selectedToolNames: string[];
  onToggle: (toolName: string) => void;
}

let expanded = false;

export const ToolSelector: m.Component<ToolSelectorAttributes> = {
  oninit() {
    fetchTools();
  },
  view(vnode) {
    const tools = getTools();
    const selectedToolNames = vnode.attrs.selectedToolNames;

    const selectionSummary = selectedToolNames.length === 0 ? "" : ` (${selectedToolNames.length})`;

    return m("div", { class: "tool-selector-section" }, [
      m(
        "button",
        {
          class: "tool-selector-toggle",
          onclick: () => {
            expanded = !expanded;
          },
        },
        [m("span", expanded ? "▾ " : "▸ "), `Tools${selectionSummary}`],
      ),
      expanded
        ? tools.length === 0
          ? m("div", { class: "tool-selector-empty text-xs text-text-faint" }, "Loading…")
          : m(
              "div",
              { class: "tool-selector-list" },
              tools.map((tool) => {
                const isSelected = selectedToolNames.includes(tool.tool_name);
                return m(
                  "button",
                  {
                    key: tool.tool_name,
                    type: "button",
                    class: ["tool-selector-option", isSelected ? "tool-selector-option--selected" : ""]
                      .filter(Boolean)
                      .join(" "),
                    onclick: () => vnode.attrs.onToggle(tool.tool_name),
                  },
                  tool.tool_name,
                );
              }),
            )
        : null,
    ]);
  },
};
