import m from "mithril";
import "./style.css";
import { App } from "./components/App";

const rootElement = document.getElementById("app");
if (rootElement) {
  m.route(rootElement, "/", {
    "/": App,
    "/new": App,
    "/conversations/:conversationId": App,
  });
}
