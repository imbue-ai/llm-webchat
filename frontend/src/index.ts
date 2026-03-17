import "./llm-api";
import m from "mithril";
import "./style.css";
import { App } from "./components/App";
import { runHook } from "./llm-api";

const rootElement = document.getElementById("app");
if (rootElement) {
  m.route(rootElement, "/", {
    "/": App,
    "/new": App,
    "/conversations/:conversationId": App,
  });
  runHook("ready");
}
