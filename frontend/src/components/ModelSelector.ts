import m from "mithril";
import { setModelsStore } from "../llm-api";

const LOCAL_STORAGE_KEY = "llm-webchat-selected-model";

interface ModelInfo {
  model_id: string;
}

interface ModelListResponse {
  models: ModelInfo[];
}

let models: ModelInfo[] = [];
let modelsLoaded = false;
let selectedModelId: string | null = null;

function loadPersistedModelId(): string | null {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistModelId(modelId: string): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, modelId);
  } catch {
    // localStorage unavailable
  }
}

export function getSelectedModelId(): string | null {
  return selectedModelId;
}

export function setSelectedModelId(modelId: string): void {
  if (models.some((model) => model.model_id === modelId)) {
    selectedModelId = modelId;
  }
}

export function getModels(): ModelInfo[] {
  return models;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

export async function fetchModels(): Promise<void> {
  if (modelsLoaded) {
    return;
  }

  try {
    const response = await m.request<ModelListResponse>({
      method: "GET",
      url: "/api/models",
    });
    models = response.models;
    modelsLoaded = true;
    setModelsStore(models);

    const persisted = loadPersistedModelId();
    if (persisted && models.some((model) => model.model_id === persisted)) {
      selectedModelId = persisted;
    } else if (models.length > 0) {
      selectedModelId = models[0].model_id;
    }
  } catch {
    modelsLoaded = true;
  }
}

export const ModelSelector: m.Component = {
  oninit() {
    fetchModels();
  },
  view() {
    if (!modelsLoaded || models.length === 0) {
      return null;
    }

    return m("div", { class: "model-selector-wrapper relative inline-block" }, [
      m(
        "select",
        {
          class: "model-selector-native absolute inset-0 w-full h-full opacity-0 cursor-pointer",
          value: selectedModelId ?? "",
          onchange: (event: Event) => {
            const select = event.target as HTMLSelectElement;
            selectedModelId = select.value;
            persistModelId(selectedModelId);
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
          m("span", { class: "model-selector-model-name" }, selectedModelId ?? ""),
          m("span", { class: "model-selector-chevron text-[10px] leading-none" }, "▾"),
        ],
      ),
    ]);
  },
};
