import { showRhomaionStartupError } from "./lib/rhomaion-startup";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { widgetKind } from "./lib/desktop-widgets";
if (
  isTauri() &&
  getCurrentWindow().label === "rhomaion-prompt" &&
  new URLSearchParams(location.search).get("rhomaion-prompt") === "1"
) {
  document.documentElement.dataset.rhomaionPrompt = "true";
  void import("./rhomaion-prompt-main").then((m) => m.mountRhomaionPrompt());
} else if (
  isTauri() &&
  getCurrentWindow().label === "quick-search" &&
  new URLSearchParams(location.search).get("quick-search") === "1"
) {
  document.documentElement.dataset.quickSearch = "true";
  void import("./quick-search-main").then((m) => m.mountQuickSearch());
} else bootMain();
function bootMain() {
  const requested = new URLSearchParams(location.search).get("desktop-widget");
  if (
    isTauri() &&
    getCurrentWindow().label === "rhomaion-ai" &&
    new URLSearchParams(location.search).get("rhomaion-ai") === "1"
  ) {
    document.documentElement.dataset.rhomaion = "true";
    void import("./rhomaion-main")
      .then(({ mountRhomaion }) => mountRhomaion())
      .catch(showRhomaionStartupError);
  } else if (
    isTauri() &&
    widgetKind(requested) &&
    getCurrentWindow().label === "desktop-widget-" + requested
  ) {
    document.documentElement.dataset.desktopWidget = "true";
    void import("./widget-main").then(({ mountWidget }) =>
      mountWidget(requested),
    );
  } else {
    void import("./app-main");
  }
}
