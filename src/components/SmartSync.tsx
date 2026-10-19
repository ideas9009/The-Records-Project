import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "../lib/auth-context";
import {
  smartSyncSettings,
  saveSmartSyncSettings,
  subscribeSync,
  syncRevision,
  syncState,
  savedDataStats,
  clearSavedData,
  type SmartSyncSettings,
} from "../lib/smart-sync";
import {
  syncSelectedPages,
  syncRunStatus,
  subscribeSyncRun,
} from "../lib/sync-runner";
import { Spinner } from "./Loading";
import "./smart-sync.css";
function useSyncRevision() {
  return useSyncExternalStore(subscribeSync, syncRevision, () => 0);
}
export function SmartSyncManager() {
  const { account } = useAuth();
  useSyncRevision();
  const prefs = smartSyncSettings(),
    pages = prefs.pages.join(",");
  useEffect(() => {
    if (!account || !prefs.enabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false)
        void syncSelectedPages();
    };
    refresh();
    const timer = setInterval(refresh, prefs.interval * 60000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [
    account?.uid,
    account?.role,
    account?.roles?.join(","),
    account?.status,
    prefs.enabled,
    prefs.interval,
    pages,
  ]);
  return null;
}
export function SyncStatus({ path }: { path: string }) {
  useSyncRevision();
  if (!smartSyncSettings().enabled) return null;
  const state = syncState(path);
  if (!state || (!state.error && state.source === "live")) return null;
  return (
    <p className="smart-sync-status" role="status">
      {state.syncing && <Spinner />}
      <span>
        {state.source === "saved"
          ? "Saved data · " + new Date(state.savedAt).toLocaleString()
          : ""}
        {state.syncing ? " · Syncing…" : state.error ? " · " + state.error : ""}
      </span>
    </p>
  );
}
export default function SmartSyncSettingsPanel() {
  useSyncRevision();
  const prefs = smartSyncSettings(),
    run = useSyncExternalStore(subscribeSyncRun, syncRunStatus, syncRunStatus);
  const [stats, setStats] = useState<{
      count: number;
      bytes: number;
      lastSynced: number | null;
    }>({ count: 0, bytes: 0, lastSynced: null }),
    [error, setError] = useState(""),
    [clearing, setClearing] = useState(false);
  const revision = syncRevision();
  useEffect(() => {
    let active = true;
    void savedDataStats()
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        if (active) setError("Offline storage is unavailable on this device.");
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function change(next: SmartSyncSettings) {
    setError("");
    try {
      await saveSmartSyncSettings(next);
    } catch {
      setError("SmartSync preferences could not be saved.");
    }
  }
  async function clear() {
    setClearing(true);
    setError("");
    try {
      await clearSavedData();
    } catch {
      setError("Saved data could not be cleared.");
    } finally {
      setClearing(false);
    }
  }
  return (
    <>
      <section className="card setting-card">
        <div className="setting-row">
          <div>
            <h2>
              SmartSync <span className="smart-sync-beta">Beta</span>
            </h2>
            <p>Show saved data while the app syncs in the background.</p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable SmartSync"
            checked={prefs.enabled}
            onChange={(event) =>
              void change({ ...prefs, enabled: event.target.checked })
            }
          />
        </div>
      </section>
      <section className="card setting-card">
        <h2>Background pages</h2>
        <p>Keep these pages updated while using other sections.</p>
        <div className="smart-sync-pages">
          {(["towns", "news", "citizens", "task-board"] as const).map(
            (page) => (
              <label key={page}>
                <input
                  type="checkbox"
                  disabled={!prefs.enabled}
                  checked={prefs.pages.includes(page)}
                  onChange={(event) =>
                    void change({
                      ...prefs,
                      pages: event.target.checked
                        ? [...prefs.pages, page]
                        : prefs.pages.filter((item) => item !== page),
                    })
                  }
                />
                {page === "towns"
                  ? "Town Registry"
                  : page === "task-board"
                    ? "Task Board (Tasks and Material Requests)"
                    : page === "citizens"
                      ? "Citizens"
                      : "News"}
              </label>
            ),
          )}
        </div>
        <label className="smart-sync-interval">
          Sync interval
          <select
            aria-label="SmartSync interval"
            disabled={!prefs.enabled}
            value={prefs.interval}
            onChange={(event) =>
              void change({ ...prefs, interval: Number(event.target.value) })
            }
          >
            {[1, 5, 15, 30].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} {minutes === 1 ? "minute" : "minutes"}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="card setting-card">
        <h2>Saved data</h2>
        <dl className="smart-sync-facts">
          <div>
            <dt>Last synced</dt>
            <dd>
              {stats.lastSynced
                ? new Date(stats.lastSynced).toLocaleString()
                : "Not synced"}
            </dd>
          </div>
          <div>
            <dt>On this device</dt>
            <dd>{(stats.bytes / 1024 / 1024).toFixed(2)} MB / 50 MB</dd>
          </div>
          <div>
            <dt>Saved responses</dt>
            <dd>{stats.count}</dd>
          </div>
        </dl>
        <div className="smart-sync-actions">
          <button
            disabled={
              !prefs.enabled || !prefs.pages.length || run.running || clearing
            }
            aria-busy={run.running}
            onClick={() => void syncSelectedPages()}
          >
            {run.running && <Spinner />}
            {run.running ? "Syncing…" : "Sync now"}
          </button>
          <button
            disabled={clearing || !stats.bytes}
            aria-busy={clearing}
            onClick={() => void clear()}
          >
            {clearing && <Spinner />}Clear saved data
          </button>
        </div>
        <p className="smart-sync-note">
          Saved copies expire after 24 hours. Sign-in checks stay online.
          Offline viewing pauses after 15 minutes without account verification.
          Task Board saves listing summaries; private offers, proof images and
          actions require a connection. Drafts and administration are excluded.
          Background syncing pauses when the app is hidden.
        </p>
      </section>
      {(error || run.error) && <p role="alert">{error || run.error}</p>}
    </>
  );
}
