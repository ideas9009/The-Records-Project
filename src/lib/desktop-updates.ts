import { APP_BUILD } from "./app-build";
import { useSyncExternalStore } from "react";
export type DesktopUpdate = {
  stage: string;
  version?: string;
  current?: string;
  notes?: string;
  message?: string;
  received?: number;
  total?: number;
  reinstall?: boolean;
  demo?: boolean;
  installationFailed?: boolean;
};
let state: DesktopUpdate = { stage: "idle" },
  engaged = false;
const listeners = new Set<() => void>();
export const desktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const update = (next: DesktopUpdate) => {
  state = { ...next, reinstall: next.reinstall ?? state.reinstall };
  listeners.forEach((fn) => fn());
};
export const updateSnapshot = () => state;
export const updateSubscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const useDesktopUpdate = () =>
  useSyncExternalStore(updateSubscribe, updateSnapshot, updateSnapshot);
export const updateBusy = (s: DesktopUpdate) =>
  ["checking", "downloading", "verifying", "installing"].includes(s.stage);
export const showUpdatePrompt = (s: DesktopUpdate) =>
  ["available", "downloading", "verifying", "ready", "installing"].includes(
    s.stage,
  ) ||
  (s.stage === "error" && engaged);
async function command(name: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DesktopUpdate>(name, args);
}
export async function checkDesktopUpdates() {
  if (!desktop() || updateBusy(state) || state.stage === "ready" || state.demo)
    return;
  update({ ...state, stage: "checking" });
  try {
    update(await command("desktop_update_check", { buildNumber: APP_BUILD }));
  } catch (e) {
    update({ stage: "error", message: String(e) });
  }
}
export function startDesktopUpdates() {
  if (!desktop()) return () => {};
  let active = true,
    unlisten: (() => void) | undefined;
  const online = () => {
    if (navigator.onLine !== false) void checkDesktopUpdates();
  };
  const timer = setTimeout(() => {
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (!active) return;
      unlisten = await listen<DesktopUpdate>("desktop-update", (event) => {
        if (active) update(event.payload);
      });
      if (!active) {
        unlisten();
        return;
      }
      try {
        const initial = await command("desktop_update_status");
        update(initial);
        if (initial.installationFailed) engaged = true;
      } catch {}
      if (active && !state.installationFailed) online();
    })();
  }, 0);
  window.addEventListener("online", online);
  const repeat = setInterval(online, 6 * 60 * 60 * 1000);
  return () => {
    active = false;
    clearTimeout(timer);
    clearInterval(repeat);
    window.removeEventListener("online", online);
    unlisten?.();
  };
}
let demoTimer: ReturnType<typeof setInterval> | undefined;
export function previewDesktopUpdate() {
  if (!import.meta.env.DEV || updateBusy(state)) return;
  engaged = false;
  update({
    stage: "available",
    version: String(APP_BUILD + 1),
    current: String(APP_BUILD),
    notes: "Preview of the sidebar update prompt. No update will be installed.",
    demo: true,
  });
}
export function dismissUpdatePreview() {
  if (!state.demo) return;
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = undefined;
  update({ stage: "idle" });
  engaged = false;
}
export async function downloadDesktopUpdate(reinstall = false) {
  if (updateBusy(state) || state.stage === "ready") return;
  engaged = true;
  if (state.demo) {
    const info = { ...state };
    let received = 0;
    update({ ...info, stage: "downloading", received: 0, total: 100 });
    demoTimer = setInterval(() => {
      received += 5;
      update({
        ...info,
        stage: received >= 100 ? "ready" : "downloading",
        received,
        total: 100,
      });
      if (received >= 100) {
        clearInterval(demoTimer);
        demoTimer = undefined;
      }
    }, 250);
    return;
  }
  if (!desktop()) return;
  update({ ...state, stage: "downloading", received: 0, total: 0, reinstall });
  try {
    update(await command("desktop_update_download", { reinstall, buildNumber: APP_BUILD }));
  } catch (e) {
    update({ stage: "error", message: String(e) });
  }
}
export function installDesktopUpdate(anchor: HTMLElement) {
  if (state.demo || state.stage !== "ready" || !desktop()) return;
  const proceed = () => {
    void command("desktop_update_install").catch((e) =>
      update({ stage: "error", message: String(e) }),
    );
  };
  const event = new CustomEvent("records-navigate", {
    cancelable: true,
    detail: { anchor, proceed },
  });
  if (window.dispatchEvent(event)) proceed();
}
