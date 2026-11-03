import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  RefreshCw,
  Download,
  X,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { APP_RELEASE_LABEL } from "../lib/app-release";
import { external } from "../lib/native";
import {
  useDesktopUpdate,
  showUpdatePrompt,
  downloadDesktopUpdate,
  installDesktopUpdate,
  checkDesktopUpdates,
  dismissUpdatePreview,
  updateBusy,
  desktop,
  type DesktopUpdate,
} from "../lib/desktop-updates";
import { Spinner } from "./Loading";
import "./desktop-updater.css";

export function updateReleaseLabel(s: DesktopUpdate) {
  const name =
    typeof s.releaseName === "string"
      ? s.releaseName
          .replace(/[\x00-\x1f]/g, " ")
          .trim()
          .replace(/^build\s+\d+\b[\s·:|–—-]*/i, "")
          .trim()
          .slice(0, 200)
      : "";
  return name && !/^\d+$/.test(name) ? name : "New release";
}
export function updateTitle(s: DesktopUpdate) {
  return (
    (
      {
        ready: "Ready to install",
        error: "Update needs attention",
        downloading: "Downloading update",
        verifying: "Verifying update",
        installing: "Installing update",
      } as Record<string, string>
    )[s.stage] || "Update available"
  );
}
export function updateBytes(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return "";
  if (value < 1024) return Math.floor(value) + " B";
  const units = ["KB", "MB", "GB"];
  let amount = value / 1024,
    index = 0;
  while (amount >= 1024 && index < 2) {
    amount /= 1024;
    index++;
  }
  return (
    amount.toLocaleString(undefined, { maximumFractionDigits: 1 }) +
    " " +
    units[index]
  );
}
export function updatePanelPosition(
  anchor: { right: number; top: number },
  width: number,
  height: number,
  scale = 1,
): CSSProperties {
  scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const panelWidth = Math.min(420 * scale, Math.max(0, width - 32));
  const left = Math.max(
    16,
    Math.min(anchor.right + 12 * scale, width - panelWidth - 16),
  );
  const top = Math.max(
    Math.min(52, height * 0.1),
    Math.min(anchor.top, Math.max(16, height - 280 * scale)),
  );
  return {
    left: left / scale,
    top: top / scale,
    width: panelWidth / scale,
    maxHeight: Math.max(0, height - top - 16) / scale,
    zoom: scale,
  };
}
export function UpdatePanelContent({
  state: s,
  onClose,
}: {
  state: DesktopUpdate;
  onClose: () => void;
}) {
  const [allNotes, setAllNotes] = useState(false);
  const percent =
    typeof s.total === "number" && s.total > 0
      ? Math.max(
          0,
          Math.min(100, Math.round(((s.received || 0) / s.total) * 100)),
        )
      : null;
  const progressing = ["downloading", "verifying", "installing"].includes(
      s.stage,
    ),
    ready = s.stage === "ready";
  return (
    <>
      <header className="update-panel-header">
        <span className="update-panel-eyebrow">
          <RefreshCw size={15} /> APP UPDATE
        </span>
        <div>
          {s.demo && <span className="update-preview-badge">Preview</span>}
          <button
            className="update-panel-close"
            aria-label="Close update prompt"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="update-panel-body">
        <span
          className={"update-panel-hero" + (progressing ? " is-working" : "")}
          aria-hidden="true"
        >
          {ready ? (
            <CheckCircle2 size={29} />
          ) : s.stage === "error" ? (
            <AlertCircle size={29} />
          ) : (
            <RefreshCw size={29} />
          )}
        </span>
        <h2 id="update-panel-title">{updateTitle(s)}</h2>
        <p className="update-panel-description">
          {ready
            ? "Your update is downloaded and verified. Restart when you’re ready."
            : s.stage === "error"
              ? "The update could not finish. You can retry from here."
              : s.stage === "installing"
                ? "The installer is running. The app will reopen when it finishes."
                : s.stage === "verifying"
                  ? "Checking the downloaded file before installation."
                  : s.stage === "downloading"
                    ? "You can keep using the app while the download finishes."
                    : "A new version of The Records Project is ready for you."}
        </p>
        <div className="update-builds">
          <div>
            <small>Installed</small>
            <strong>{APP_RELEASE_LABEL}</strong>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
          <div>
            <small>{ready ? "Ready to install" : "Available"}</small>
            <strong>{updateReleaseLabel(s)}</strong>
          </div>
        </div>
        {s.stage === "available" && (
          <section className="update-release-notes" aria-label="Release notes">
            <h3>What’s new</h3>
            <div
              id="update-release-copy"
              className={
                allNotes
                  ? "update-release-copy"
                  : "update-release-copy is-clamped"
              }
            >
              {s.notes ? (
                <ReactMarkdown
                  skipHtml
                  disallowedElements={["img"]}
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={href?.startsWith("https://") ? href : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          if (href?.startsWith("https://"))
                            void external(href).catch(() => {});
                        }}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {s.notes}
                </ReactMarkdown>
              ) : (
                <p>No release notes were included with this build.</p>
              )}
            </div>
            {(s.notes?.length || 0) > 300 && (
              <button
                className="update-notes-toggle"
                aria-expanded={allNotes}
                aria-controls="update-release-copy"
                onClick={() => setAllNotes((value) => !value)}
              >
                {allNotes ? "Show less" : "Read all release notes"}
              </button>
            )}
          </section>
        )}
        {progressing && (
          <section className="update-download" aria-label="Update progress">
            <div className="update-download-heading">
              <span role="status">
                <Spinner />
                {s.stage === "downloading"
                  ? "Downloading"
                  : s.stage === "verifying"
                    ? "Verifying download"
                    : "Installing update"}
              </span>
              {s.stage === "downloading" && percent !== null && (
                <strong aria-hidden="true">{percent}%</strong>
              )}
            </div>
            <progress
              aria-label="Update download progress"
              max={100}
              value={
                s.stage === "downloading" && percent !== null
                  ? percent
                  : undefined
              }
            />
            {s.stage === "downloading" && (
              <small>
                {s.demo ? "Simulated download · " : ""}
                {typeof s.received === "number" && s.total
                  ? updateBytes(s.received) + " of " + updateBytes(s.total)
                  : "Waiting for download information…"}
              </small>
            )}
          </section>
        )}
        {s.stage === "error" && (
          <div className="update-panel-error" role="alert">
            <AlertCircle size={18} />
            <p>{s.message || "Please check your connection and try again."}</p>
          </div>
        )}
        {ready && (
          <p className="update-ready-note" role="status">
            {s.demo
              ? "Preview complete. Nothing was downloaded or installed."
              : "Save your work before restarting. Installation begins only when you choose it below."}
          </p>
        )}
        <p className="update-assurance">
          <ShieldCheck size={15} />
          {s.demo
            ? "Simulation only · Your installed app stays unchanged"
            : "Your settings and account are kept"}
        </p>
      </div>
      <footer className="update-panel-footer">
        {s.stage === "available" && (
          <button
            className="update-primary"
            onClick={() => void downloadDesktopUpdate()}
          >
            <Download size={17} />
            Download update
          </button>
        )}
        {ready && (
          <button
            className="update-primary"
            disabled={s.demo}
            onClick={(event) => installDesktopUpdate(event.currentTarget)}
          >
            <RefreshCw size={17} />
            Install and restart
          </button>
        )}
        {s.stage === "error" && (
          <button
            className="update-primary"
            onClick={() => void downloadDesktopUpdate(!!s.reinstall)}
          >
            <RefreshCw size={17} />
            Retry download
          </button>
        )}
        <div className="update-secondary-actions">
          <button onClick={onClose}>
            {progressing ? "Hide progress" : "Later"}
          </button>
          {s.demo && (
            <button onClick={dismissUpdatePreview}>End preview</button>
          )}
        </div>
      </footer>
    </>
  );
}
function UpdatePopover({
  anchor,
  state,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  state: DesktopUpdate;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState<CSSProperties>({
    visibility: "hidden",
  });
  useLayoutEffect(() => {
    const trigger = anchor.current;
    if (!trigger) return;
    const sidebar = trigger.closest("aside") || trigger;
    let frame = 0;
    const measure = () => {
      const rect = sidebar.getBoundingClientRect();
      const scale =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--ui-scale",
          ),
        ) || 1;
      setPosition(
        updatePanelPosition(rect, window.innerWidth, window.innerHeight, scale),
      );
    };
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(place);
    observer.observe(sidebar);
    measure();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLButtonElement>(".update-panel-close")
      ?.focus({ preventScroll: true });
    const modalOpen = () =>
      !!document.querySelector(
        'dialog[open], [role="dialog"][aria-modal="true"]',
      );
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || modalOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        anchor.current?.focus({ preventScroll: true });
      }
    };
    const outside = (event: PointerEvent) => {
      if (modalOpen()) return;
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      )
        close.current();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={panel}
      className="update-popover"
      style={position}
      id="sidebar-update-details"
      role="dialog"
      aria-modal="false"
      aria-labelledby="update-panel-title"
    >
      <UpdatePanelContent
        state={state}
        onClose={() => {
          onClose();
          anchor.current?.focus({ preventScroll: true });
        }}
      />
    </div>,
    document.body,
  );
}
export function SidebarUpdater({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const s = useDesktopUpdate(),
    anchor = useRef<HTMLButtonElement>(null);
  if (!showUpdatePrompt(s)) return null;
  const title = updateTitle(s),
    busy = ["downloading", "verifying", "installing"].includes(s.stage);
  const percent = s.total
    ? Math.max(
        0,
        Math.min(100, Math.round(((s.received || 0) / s.total) * 100)),
      )
    : null;
  return (
    <section className="sidebar-brand updater-brand" aria-label="App update">
      <button
        ref={anchor}
        className="updater-trigger"
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-controls="sidebar-update-details"
        aria-haspopup="dialog"
        onClick={onToggle}
      >
        <span
          className={"update-reminder-icon" + (busy ? " is-working" : "")}
          aria-hidden="true"
        >
          {s.stage === "ready" ? (
            <CheckCircle2 size={29} />
          ) : (
            <RefreshCw size={29} />
          )}
          <i className="update-notification-dot" />
        </span>
        <span className="update-brand-copy">
          <strong>{title}</strong>
          <small>
            {s.stage === "downloading" && percent !== null
              ? percent + "% downloaded"
              : updateReleaseLabel(s) + " · View update"}
          </small>
        </span>
        {s.stage === "downloading" && percent !== null && (
          <span className="update-compact-progress">{percent}%</span>
        )}
      </button>
      {open && typeof document !== "undefined" && (
        <UpdatePopover anchor={anchor} state={s} onClose={onToggle} />
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
    </section>
  );
}
