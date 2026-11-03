import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/auth-context";
import RhomaionChat from "./pages/RhomaionChat";
import "./pages/RhomaionSpotlight.css";
export function mountRhomaionPrompt() {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void invoke("quick_search_close");
      }
    },
    true,
  );
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AuthProvider preload>
        <RhomaionChat spotlight />
      </AuthProvider>
    </React.StrictMode>,
  );
}
