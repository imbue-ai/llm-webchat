import m from "mithril";
import { apiUrl } from "../base-path";

export interface Tool {
  tool_name: string;
}

interface ToolListResponse {
  tools: Tool[];
}

let tools: Tool[] = [];
let toolsLoaded = false;

export function getTools(): Tool[] {
  return tools;
}

export async function fetchTools(): Promise<void> {
  if (toolsLoaded) {
    return;
  }

  const response = await m.request<ToolListResponse>({
    method: "GET",
    url: apiUrl("/api/tools"),
  });
  tools = response.tools;
  toolsLoaded = true;
}
