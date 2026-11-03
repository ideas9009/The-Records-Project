import React from "react";
import { showRhomaionStartupError } from "./lib/rhomaion-startup";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/auth-context";
import RhomaionChat from "./pages/RhomaionChat";

export function mountRhomaion() {
  createRoot(document.getElementById("root")!, {
    onUncaughtError: showRhomaionStartupError,
  }).render(
    <React.StrictMode>
      <AuthProvider>
        <RhomaionChat />
      </AuthProvider>
    </React.StrictMode>,
  );
}
