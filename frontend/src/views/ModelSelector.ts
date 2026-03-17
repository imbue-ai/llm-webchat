import m from "mithril";
import { areModelsLoaded, fetchModels, getModels, getSelectedModelId, selectModelId } from "../models/Model";

export const ModelSelector: m.Component = {
  oninit() {
    fetchModels();
  },
  view() {
    if (!areModelsLoaded() || getModels().length === 0) {
      return null;
    }

    const models = getModels();
    const selectedId = getSelectedModelId();

    return m("div", { class: "model-selector-wrapper relative inline-block" }, [
      m(
        "select",
        {
          class: "model-selector-native absolute inset-0 w-full h-full opacity-0 cursor-pointer",
          value: selectedId ?? "",
          onchange: (event: Event) => {
            const select = event.target as HTMLSelectElement;
            selectModelId(select.value);
          },
        },
        models.map((model) => m("option", { key: model.model_id, value: model.model_id }, model.model_id)),
      ),
      m(
        "span",
        {
          class:
            "model-selector-label inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer select-none",
        },
        [
          m("span", { class: "model-selector-model-name" }, selectedId ?? ""),
          m("span", { class: "model-selector-chevron text-[10px] leading-none" }, "▾"),
        ],
      ),
    ]);
  },
};
