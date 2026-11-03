import { canUseDeveloperTools } from "./developer-tools";
import type { Account } from "./cloud-auth";
import { APP_RELEASE_LABEL } from "./app-release";
import { APP_BUILD } from "./app-build";
import { useSyncExternalStore } from "react";
export type DesktopUpdate = {
  stage: string;
  version?: string; // Internal numeric tag; never used as the public release name.
  releaseName?: string;
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
  const continuing = ["downloading", "verifying", "ready", "installing", "error"].includes(next.stage) && (!next.version || next.version === state.version);
  state = { ...next, releaseName: next.releaseName ?? (continuing ? state.releaseName : undefined), reinstall: next.reinstall ?? state.reinstall };
  listeners.forEach((fn) => fn());
};
const receiveNativeUpdate = (next: DesktopUpdate) => {
  if(state.demo){beforePreview={...next};if(next.installationFailed)engagedBeforePreview=true;return;}
  update(next);
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
        if (active) receiveNativeUpdate(event.payload);
      });
      if (!active) {
        unlisten();
        return;
      }
      try {
        const initial = await command("desktop_update_status");
        receiveNativeUpdate(initial);
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
let beforePreview: DesktopUpdate | null = null, engagedBeforePreview = false;
export function previewDesktopUpdate(account?: Account | null, mode: "reminder" | "prompt" = "prompt") {
  if (!desktop() || !canUseDeveloperTools(account) || updateBusy(state) || (!state.demo && state.stage === "ready")) return false;
  if(!state.demo){beforePreview={...state};engagedBeforePreview=engaged;}
  engaged = false;
  update({
    stage: "available",
    version: String(APP_BUILD + 1),
    current: String(APP_BUILD),
    releaseName: APP_RELEASE_LABEL.replace(/\s*\|\s*Phase\s*3\s*$/i, ""),
    notes: "A preview of the new update experience.\n\n- See the current and upcoming release names.\n- Try the download progress and ready-to-install state.\n- End the preview to restore the real updater.\n\nNothing is downloaded or installed in this preview.",
    demo: true,
  });
  window.dispatchEvent(new Event(mode === "reminder" ? "records-preview-update-reminder" : "records-open-update"));
  return true;
}
export function dismissUpdatePreview() {
  if (!state.demo) return;
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = undefined;
  update(beforePreview || { stage: "idle" });
  beforePreview = null;
  engaged = engagedBeforePreview;
}
export async function downloadDesktopUpdate(reinstall = false) {
  if (updateBusy(state) || state.stage === "ready") return;
  engaged = true;
  if (state.demo) {
    const info = { ...state };
    let received = 0;
    const total = 100 * 1024 * 1024;
    update({ ...info, stage: "downloading", received: 0, total });
    demoTimer = setInterval(() => {
      received += 5;
      update({
        ...info,
        stage: received >= 100 ? "ready" : "downloading",
        received: Math.min(received,100) / 100 * total,
        total,
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
