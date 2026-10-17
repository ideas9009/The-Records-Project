import SmartSyncSettingsPanel from "../components/SmartSync";
import { LoadingStatus } from "../components/Loading";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  wallpapers,
  restoreWallpaper,
  selectWallpaper,
} from "../lib/wallpaper";
import {
  applyAppearance,
  interfaceScale,
  savedPotato,
  savedScale,
} from "../lib/appearance";
type WindowsPreferences = {
  startup: boolean;
  minimized: boolean;
  background: boolean;
};
export default function Settings() {
  const [tab, setTab] = useState("appearance");
  const [scale, setScale] = useState(savedScale),
    [potato, setPotato] = useState(savedPotato);
  const [selected, setSelected] = useState(
    () => localStorage.getItem("records-wallpaper") || "",
  );
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [windows, setWindows] = useState<WindowsPreferences | null>(null),
    [busy, setBusy] = useState(false);
  const desktop = isTauri();
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    invoke<WindowsPreferences>("get_windows_preferences")
      .then((p) => {
        if (active) setWindows(p);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not read Windows preferences. Please reopen Settings to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [desktop]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 2500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const refresh = () => {
      setScale(savedScale());
      setPotato(savedPotato());
      setSelected(localStorage.getItem("records-wallpaper") || "");
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("records-wallpaper", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("records-wallpaper", refresh);
    };
  }, []);
  async function saveAppearance(key: string, value: string) {
    const previous = localStorage.getItem(key);
    try {
      localStorage.setItem(key, value);
      applyAppearance();
      if (key !== "records-zoom") await restoreWallpaper();
      setScale(savedScale());
      setPotato(savedPotato());
      setMessage("Saved");
      setError("");
    } catch (reason) {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
      applyAppearance();
      await restoreWallpaper();
      setScale(savedScale());
      setPotato(savedPotato());
      setError("Could not save your preference on this device.");
    }
  }
  async function choose(url: string | null) {
    try {
      await selectWallpaper(url);
      setSelected(url || "");
      setMessage("Wallpaper saved");
      setError("");
    } catch {
      setError("Could not save the wallpaper selection.");
    }
  }
  async function changeWindows(key: keyof WindowsPreferences, value: boolean) {
    if (!windows || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = { ...windows, [key]: value };
      if (key === "background")
        await invoke("set_background", { enabled: value });
      else
        await invoke("set_startup", {
          enabled: next.startup,
          minimized: next.minimized,
        });
      setWindows(await invoke<WindowsPreferences>("get_windows_preferences"));
      setMessage("Saved");
    } catch {
      setError("Windows could not save this change. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
        </div>
        <span className="save-feedback" role="status">
          {message}
        </span>
      </header>
      <div className="settings-layout">
        <div
          className="settings-categories"
          role="tablist"
          aria-label="Settings categories"
        >
          {[
            ["appearance", "Appearance", "wallpaper"],
            ["smartsync", "SmartSync", "sync"],
            ["windows", "Windows behaviour", "desktop_windows"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              id={"tab-" + id}
              role="tab"
              aria-selected={tab === id}
              aria-controls={"settings-" + id}
              onClick={() => {
                setTab(id);
                setError("");
              }}
            >
              <span className="material-symbol" aria-hidden="true">
                {icon}
              </span>
              {label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={"settings-" + tab}
          aria-labelledby={"tab-" + tab}
          className="settings-content"
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {tab === "smartsync" ? (
            <SmartSyncSettingsPanel />
          ) : tab === "appearance" ? (
            <>
              <section className="card setting-card">
                <div className="setting-row">
                  <div>
                    <h2>Interface scale</h2>
                  </div>
                  <div className="scale-control">
                    <div className="scale-value">
                      <output htmlFor="interface-scale">
                        {scale}%{scale === 100 ? " (Default)" : ""}
                      </output>
                      {scale !== 100 && (
                        <button
                          type="button"
                          className="scale-reset"
                          onClick={() =>
                            void saveAppearance("records-zoom", "100")
                          }
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <input
                      id="interface-scale"
                      type="range"
                      aria-label="Interface scale"
                      aria-valuetext={scale + " percent"}
                      min={interfaceScale.min}
                      max={interfaceScale.max}
                      step={interfaceScale.step}
                      value={scale}
                      onChange={(e) => setScale(Number(e.currentTarget.value))}
                      onPointerUp={(e) =>
                        void saveAppearance(
                          "records-zoom",
                          e.currentTarget.value,
                        )
                      }
                      onPointerCancel={() => setScale(savedScale())}
                      onKeyUp={(e) => {
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                            "Home",
                            "End",
                            "PageUp",
                            "PageDown",
                          ].includes(e.key)
                        )
                          void saveAppearance(
                            "records-zoom",
                            e.currentTarget.value,
                          );
                      }}
                      onBlur={(e) => {
                        if (Number(e.currentTarget.value) !== savedScale())
                          void saveAppearance(
                            "records-zoom",
                            e.currentTarget.value,
                          );
                      }}
                    />
                    <div className="scale-endpoints" aria-hidden="true">
                      <span>20%</span>
                      <span>100%</span>
                      <span>180%</span>
                    </div>
                  </div>
                </div>
              </section>
              <section className="card setting-card">
                <label className="setting-row">
                  <span>
                    <h2>Potato Mode</h2>
                    <p>
                      Solid grey surfaces. Disables blur, tint effects and
                      animations.
                    </p>
                    <small>Wallpaper selection is preserved.</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Potato Mode"
                    checked={potato}
                    onChange={(e) =>
                      void saveAppearance(
                        "records-potato",
                        String(e.target.checked),
                      )
                    }
                  />
                </label>
              </section>
              <section className="card setting-card wallpaper-settings">
                <div className="setting-section-title">
                  <div>
                    <h2>Wallpaper</h2>
                  </div>
                  <span className="badge">{wallpapers.length} wallpapers</span>
                </div>
                {potato && (
                  <p className="wallpaper-paused">
                    Wallpaper is hidden in Potato Mode.
                  </p>
                )}
                <div className="settings-wallpapers">
                  <button
                    className={!selected ? "chosen" : ""}
                    aria-label="No wallpaper"
                    aria-pressed={!selected}
                    onClick={() => void choose(null)}
                  >
                    <span className="wallpaper-none">
                      <span className="material-symbol" aria-hidden="true">
                        hide_image
                      </span>
                    </span>
                    <span>
                      No wallpaper
                      {!selected && (
                        <span
                          className="material-symbol selection-check"
                          aria-hidden="true"
                        >
                          check_circle
                        </span>
                      )}
                    </span>
                  </button>
                  {wallpapers.map((image) => (
                    <button
                      key={image.file}
                      className={selected === image.url ? "chosen" : ""}
                      aria-label={"Use " + image.name}
                      aria-pressed={selected === image.url}
                      onClick={() => void choose(image.url)}
                    >
                      <img
                        src={image.thumbnail}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span>
                        {image.name}
                        {selected === image.url && (
                          <span
                            className="material-symbol selection-check"
                            aria-hidden="true"
                          >
                            check_circle
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="card setting-card">
              <h2>Windows behaviour</h2>
              {!desktop && (
                <p className="wallpaper-paused">
                  Available in the Windows app.
                </p>
              )}
              {busy && <LoadingStatus>Saving preferences…</LoadingStatus>}
              {desktop && !windows && !error && (
                <LoadingStatus>Reading your preferences…</LoadingStatus>
              )}
              {[
                [
                  "startup",
                  "Launch with Windows",
                  "Launch automatically at Windows sign-in.",
                ],
                ["minimized", "Start minimized", "Launch to the system tray."],
                [
                  "background",
                  "Close to tray",
                  "Closing the window keeps the app in the tray. Select Quit to exit.",
                ],
              ].map(([key, label, description]) => (
                <label className="setting-row windows-setting" key={key}>
                  <span>
                    <h3>{label}</h3>
                    <p>{description}</p>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={label}
                    checked={
                      windows?.[key as keyof WindowsPreferences] || false
                    }
                    disabled={
                      !desktop ||
                      !windows ||
                      busy ||
                      (key === "minimized" && !windows.startup)
                    }
                    onChange={(e) =>
                      void changeWindows(
                        key as keyof WindowsPreferences,
                        e.target.checked,
                      )
                    }
                  />
                </label>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
