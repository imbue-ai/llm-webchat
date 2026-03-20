import m from "mithril";
import { fetchModels, getModels } from "../models/Model";

interface ModelSelectorAttributes {
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
}

let open = false;

function closeDropdown(): void {
  open = false;
  m.redraw();
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target.closest(".model-selector-wrapper")) {
    closeDropdown();
  }
}

function scrollSelectedIntoView(dropdownElement: HTMLElement, selectedModelId: string | null): void {
  if (selectedModelId === null) {
    return;
  }
  const selectedOption = dropdownElement.querySelector(
    `[data-model-id="${CSS.escape(selectedModelId)}"]`,
  ) as HTMLElement | null;
  if (selectedOption === null) {
    return;
  }

  const optionHeight = selectedOption.offsetHeight;
  if (optionHeight === 0) {
    return;
  }

  const visibleHeight = dropdownElement.clientHeight;
  const itemsVisible = Math.floor(visibleHeight / optionHeight);
  const selectedIndex = Math.round(selectedOption.offsetTop / optionHeight);
  const centeredStartIndex = Math.max(0, selectedIndex - Math.floor(itemsVisible / 2));
  dropdownElement.scrollTop = centeredStartIndex * optionHeight;
}

export const ModelSelector: m.Component<ModelSelectorAttributes> = {
  oninit() {
    fetchModels();
  },
  oncreate() {
    document.addEventListener("click", handleDocumentClick);
  },
  onremove() {
    document.removeEventListener("click", handleDocumentClick);
  },
  view(vnode) {
    const models = getModels();
    if (models.length === 0) {
      return null;
    }

    const selectedId = vnode.attrs.selectedModelId;
    const selectedModelExists = selectedId !== null && models.some((model) => model.model_id === selectedId);

    function handleToggle(event: Event): void {
      event.stopPropagation();
      open = !open;
    }

    function handleSelect(modelId: string): void {
      vnode.attrs.onSelect(modelId);
      open = false;
    }

    return m("div", { class: "model-selector-wrapper" }, [
      m(
        "button",
        {
          class: "model-selector-trigger",
          onclick: handleToggle,
          type: "button",
        },
        [
          m(
            "span",
            { class: "model-selector-model-name" },
            selectedModelExists ? selectedId : selectedId ? `${selectedId} (unavailable)` : "",
          ),
          m("span", { class: "model-selector-chevron" }, "▾"),
        ],
      ),
      open
        ? m("div", { class: "model-selector-dropdown" }, [
            m(
              "ul",
              {
                class: "model-selector-dropdown-list",
                oncreate: (listVnode: m.VnodeDOM) => {
                  scrollSelectedIntoView(listVnode.dom as HTMLElement, selectedId);
                },
              },
              models.map((model) =>
                m(
                  "li",
                  {
                    key: model.model_id,
                    "data-model-id": model.model_id,
                    class: [
                      "model-selector-option",
                      model.model_id === selectedId ? "model-selector-option--selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" "),
                    onclick: () => handleSelect(model.model_id),
                  },
                  model.model_id,
                ),
              ),
            ),
          ])
        : null,
    ]);
  },
};
