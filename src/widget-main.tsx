import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/auth-context";
import WidgetHost from "./pages/WidgetHost";
import type { WidgetKind } from "./lib/desktop-widgets";
import "./pages/WidgetHost.css";
export function mountWidget(kind: WidgetKind) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AuthProvider>
        <WidgetHost kind={kind} />
      </AuthProvider>
    </React.StrictMode>,
  );
}
