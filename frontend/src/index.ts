import { llmApi } from "./llm-api";
import type { LlmApi } from "./llm-api";
import { runHook } from "./hooks";
import m from "mithril";
import "./style.css";
import { App } from "./components/App";

declare global {
  interface Window {
    $llm: LlmApi;
  }
  var $llm: LlmApi;
}

window.$llm = llmApi;

function bootstrap(): void {
  m.route.prefix = "";
  const rootElement = document.getElementById("app");
  if (rootElement) {
    m.route(rootElement, "/", {
      "/": App,
      "/new": App,
      "/conversations/:conversationId": App,
    });
    runHook("ready");
  }
}

window.addEventListener("load", bootstrap);
