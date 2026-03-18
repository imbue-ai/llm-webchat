import m from "mithril";
import { isSlotClaimed } from "../slots";

/**
 * An empty extension point that plugins can claim and fill with their own DOM.
 *
 * When claimed, mithril skips child reconciliation (via onbeforeupdate returning
 * true) so that plugin-injected children survive redraws.
 */
export function EmptySlot(): m.Component<{ name: string; class?: string }> {
  return {
    onbeforeupdate(vnode: m.Vnode<{ name: string; class?: string }>) {
      // When claimed, tell mithril to skip diffing this subtree so
      // plugin-injected children are preserved across redraws.
      return !isSlotClaimed(vnode.attrs.name);
    },

    view(vnode: m.Vnode<{ name: string; class?: string }>) {
      return m("div", {
        class: vnode.attrs.class || vnode.attrs.name,
        "data-slot": vnode.attrs.name,
      });
    },
  };
}
