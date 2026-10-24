import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {AuthProvider} from "./lib/auth-context";
import "./styles.css";
import "./legacy.css";
import "./sidebar.css";
import "./settings.css";
import "./surfaces.css";
import "./page-banners.css";
import "./viewport.css";
import "./page-scroll.css";
import { applyAppearance } from "./lib/appearance";
import { restoreWallpaper } from "./lib/wallpaper";
document.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });
applyAppearance();
void restoreWallpaper().catch(console.error);
window.addEventListener("storage", (e) => {
  if (e.key === null || ["records-zoom", "records-potato"].includes(e.key)) {
    applyAppearance();
    void restoreWallpaper().catch(console.error);
  }
  if (e.key === "records-wallpaper" || e.key === "records-wallpaper-name")
    void restoreWallpaper().catch(console.error);
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider><App /></AuthProvider>
  </React.StrictMode>,
);
