import {openQuickSearch} from "../lib/quick-search";
import { openRhomaion, RHOMAION_NAME } from "../lib/rhomaion";
import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAuth } from "../lib/auth-context";
import {
  checkDesktopUpdates,
  useDesktopUpdate,
  updateBusy,
} from "../lib/desktop-updates";
import {
  desktopRefreshEvent,
  guardPageAction,
  reloadDesktopApp,
} from "../lib/desktop-chrome";
import "./desktop-chrome.css";
export default function DesktopChrome({ children }: { children: ReactNode }) {
  const native = isTauri() && getCurrentWindow().label === "main",
    { account } = useAuth(),
    update = useDesktopUpdate();
  const [maximized, setMaximized] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!native) return;
    let active = true,
      unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    const measure = () =>
      void win
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {});
    measure();
    void win
      .onResized(measure)
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {});
    return () => {
      active = false;
      unlisten?.();
    };
  }, [native]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!native) return;
    const status = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener("records-desktop-status", status);
    return () => window.removeEventListener("records-desktop-status", status);
  }, [native]);
  if (!native) return <>{children}</>;
  const action = (work: () => Promise<void>) => {
    void work().catch(() =>
      setMessage("The window action could not be completed."),
    );
  };
  const icon = (name: string) => (
    <span className="material-symbol" aria-hidden="true">
      {name}
    </span>
  );
  return (
    <div className="desktop-frame">
      <header className="desktop-titlebar" aria-label="Window controls">
        <div
          className="desktop-drag-area"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            action(() =>
              e.detail === 2
                ? getCurrentWindow().toggleMaximize()
                : getCurrentWindow().startDragging(),
            );
          }}
        >
          <img src="/trp-logo.png" alt="" draggable={false} />
          <span>The Records Project</span>
        </div>
        <span className="desktop-action-status" role="status">
          {message ||
            (update.stage === "checking" ? "Checking for updates…" : "")}
        </span>
        <div className="desktop-toolbar">
          <button aria-label="Quick Search" title="Quick Search · Alt + Q" onClick={()=>void openQuickSearch().catch(()=>setMessage("Quick Search could not open. Restart the app to load the new window."))}>{icon("search")}</button>
          <button
            aria-label={RHOMAION_NAME}
            title={RHOMAION_NAME}
            disabled={!account || account.status !== "approved"}
            onClick={() =>
              account &&
              void openRhomaion(account.uid).catch(() =>
                setMessage(
                  "Rhōmaíōn could not open. Restart the desktop app to load its window controls.",
                ),
              )
            }
          >
            {icon("auto_awesome")}
          </button>
          <button
            type="button"
            aria-label="Check for updates"
            title="Check for updates"
            disabled={updateBusy(update)}
            onClick={() => {
              void checkDesktopUpdates().then(() =>
                window.dispatchEvent(new Event("records-open-update")),
              );
            }}
          >
            {icon("cycle")}
          </button>
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            disabled={!account || account.status !== "approved"}
            onClick={() =>
              window.dispatchEvent(new Event("records-toggle-notifications"))
            }
          >
            {icon("notifications")}
          </button>
          <button
            type="button"
            aria-label="Refresh page"
            title="Refresh page · Ctrl-click to reload the app and resync"
            onClick={(e) => {
              if (account)
                window.dispatchEvent(
                  new CustomEvent(desktopRefreshEvent, {
                    detail: { full: e.ctrlKey, anchor: e.currentTarget },
                  }),
                );
              else if (e.ctrlKey) reloadDesktopApp();
              else
                window.dispatchEvent(
                  new CustomEvent(desktopRefreshEvent, {
                    detail: { full: false, anchor: e.currentTarget },
                  }),
                );
            }}
          >
            {icon("refresh")}
          </button>
        </div>
        <div className="desktop-window-buttons">
          <button
            type="button"
            aria-label="Minimize window"
            title="Minimize"
            onClick={() => action(() => getCurrentWindow().minimize())}
          >
            {icon("remove")}
          </button>
          <button
            type="button"
            aria-label={maximized ? "Restore window" : "Maximize window"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() => action(() => getCurrentWindow().toggleMaximize())}
          >
            {icon(maximized ? "filter_none" : "crop_square")}
          </button>
          <button
            type="button"
            className="desktop-close"
            aria-label="Close window"
            title="Close"
            onClick={(e) =>
              guardPageAction(
                () => action(() => getCurrentWindow().close()),
                e.currentTarget,
              )
            }
          >
            {icon("close")}
          </button>
        </div>
      </header>
      <div className="desktop-content">{children}</div>
    </div>
  );
}
