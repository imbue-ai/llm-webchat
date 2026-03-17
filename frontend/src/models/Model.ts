import m from "mithril";

const LOCAL_STORAGE_KEY = "llm-webchat-selected-model";

export interface Model {
  model_id: string;
}

interface ModelListResponse {
  models: Model[];
}

let models: Model[] = [];
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

export function selectModelId(modelId: string): void {
  selectedModelId = modelId;
  persistModelId(modelId);
}

export function getModels(): Model[] {
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
