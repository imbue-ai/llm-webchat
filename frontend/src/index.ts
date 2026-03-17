import { llmApi, runHook } from "./llm-api";
import m from "mithril";
import "./style.css";
import { App } from "./components/App";

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
