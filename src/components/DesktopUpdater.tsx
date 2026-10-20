import { useState } from "react";
import {
  useDesktopUpdate,
  showUpdatePrompt,
  downloadDesktopUpdate,
  installDesktopUpdate,
  checkDesktopUpdates,
  previewDesktopUpdate,
  dismissUpdatePreview,
  updateBusy,
  desktop,
} from "../lib/desktop-updates";
import { Spinner } from "./Loading";
import "./desktop-updater.css";
export function SidebarUpdater({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const s = useDesktopUpdate();
  if (!showUpdatePrompt(s)) return null;
  const percent = s.total
    ? Math.min(100, Math.round(((s.received || 0) / s.total) * 100))
    : null;
  const title =
    s.stage === "ready"
      ? "Ready to install"
      : s.stage === "error"
        ? "Update needs attention"
        : s.stage === "downloading"
          ? "Downloading update"
          : s.stage === "verifying"
            ? "Verifying update"
            : s.stage === "installing"
              ? "Installing update"
              : "Update available";
  return (
    <section className="sidebar-brand updater-brand" aria-label="App update">
      <button
        className="updater-trigger"
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-controls="sidebar-update-details"
        onClick={onToggle}
      >
        <span className="material-symbol update-flash" aria-hidden="true">
          {s.stage === "ready" ? "download_done" : "system_update_alt"}
        </span>
        <span className="update-brand-copy">{title}</span>
        {s.stage === "downloading" && percent !== null && (
          <span className="update-compact-progress">{percent}%</span>
        )}
      </button>
      {open && (
        <div className="sidebar-update-details" id="sidebar-update-details">
          <p>
            {s.demo
              ? "Preview only"
              : s.version
                ? "Build " + s.version
                : "Nostra-2"}
          </p>
          {s.stage === "available" && s.notes && (
            <p className="update-notes">{s.notes}</p>
          )}
          {["downloading", "verifying", "installing"].includes(s.stage) && (
            <>
              <p className="update-stage" role="status">
                <Spinner />
                {s.stage === "downloading"
                  ? percent === null
                    ? "Connecting..."
                    : "Downloaded " + percent + "%"
                  : s.stage === "verifying"
                    ? "Checking the download..."
                    : "Installing. The app will reopen."}
              </p>
              <progress
                aria-label="Update download progress"
                max={100}
                value={
                  s.stage === "downloading" && percent !== null
                    ? percent
                    : undefined
                }
              />
            </>
          )}
          {s.stage === "available" && (
            <button
              className="update-action"
              onClick={() => void downloadDesktopUpdate()}
            >
              Download update
            </button>
          )}
          {s.stage === "ready" && (
            <>
              <p>Save your work before restarting.</p>
              {!s.demo && (
                <button
                  className="update-action"
                  onClick={(e) => installDesktopUpdate(e.currentTarget)}
                >
                  Install and restart
                </button>
              )}
              {s.demo && (
                <p role="status">
                  Preview complete. Nothing was downloaded or installed.
                </p>
              )}
            </>
          )}
          {s.stage === "error" && (
            <>
              <p role="alert">{s.message}</p>
              <button
                className="update-action"
                onClick={() => void downloadDesktopUpdate(!!s.reinstall)}
              >
                Retry download
              </button>
            </>
          )}
          {s.demo && (
            <button onClick={dismissUpdatePreview}>End preview</button>
          )}
          <button className="update-collapse" onClick={onToggle}>
            Collapse
          </button>
        </div>
      )}
    </section>
  );
}
export function AboutUpdater() {
  const s = useDesktopUpdate(),
    [reinstall, setReinstall] = useState(false);
  return (
    <section className="card about-updater">
      <h2>Updates</h2>
      {desktop() ? (
        <>
          <p>
            Updates are checked when the app launches and when your connection
            returns. Downloads and installation progress appear in the sidebar.
          </p>
          <div className="update-actions">
            <button
              disabled={updateBusy(s) || s.stage === "ready"}
              onClick={() => void checkDesktopUpdates()}
            >
              {s.stage === "checking" && <Spinner />}Check for updates
            </button>
            <button
              disabled={updateBusy(s) || s.stage === "ready"}
              onClick={() => setReinstall(true)}
            >
              Reinstall latest release
            </button>
          </div>
          {reinstall && (
            <div className="update-reinstall-confirm">
              <p>
                Download the MSI from the latest release? Your local settings
                will be kept. Installation starts only after you choose Install
                and restart in the sidebar.
              </p>
              <button
                onClick={() => {
                  setReinstall(false);
                  void downloadDesktopUpdate(true);
                }}
              >
                Download reinstall
              </button>
              <button onClick={() => setReinstall(false)}>Cancel</button>
            </div>
          )}
          {s.stage === "up_to_date" && <p role="status">You are up to date.</p>}
          {s.stage === "error" && <p role="alert">{s.message}</p>}
        </>
      ) : (
        <p>
          The website updates automatically. MSI updates and reinstallation are
          available in the Windows app.
        </p>
      )}
      {import.meta.env.DEV && (
        <div className="update-actions">
          <button disabled={updateBusy(s)} onClick={previewDesktopUpdate}>
            Preview sidebar update prompt
          </button>
        </div>
      )}
    </section>
  );
}
