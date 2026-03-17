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

export function getModels(): Model[] {
  return models;
}

export function getDefaultModelId(): string | null {
  const persisted = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (persisted && models.some((model) => model.model_id === persisted)) {
    return persisted;
  }
  if (models.length > 0) {
    return models[0].model_id;
  }
  return null;
}

export function persistSelectedModelId(modelId: string): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, modelId);
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
  } catch {
    modelsLoaded = true;
  }
}
