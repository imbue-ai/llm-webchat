import m from "mithril";

export const Spinner: m.Component<{ className?: string }> = {
  view(vnode) {
    return m("span", {
      class: [
        "spinner inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white",
        vnode.attrs.className,
      ]
        .filter(Boolean)
        .join(" "),
      "aria-hidden": "true",
    });
  },
};
