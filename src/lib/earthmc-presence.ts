import { startBackgroundPolling } from "./background-polling";
import { useSyncExternalStore } from "react";
import { apiRequest } from "./api";
export type EarthMcPresence = {
  players: { uuid: string; name: string }[] | null;
  checkedAt: string;
  error: string;
};
const empty: EarthMcPresence = { players: null, checkedAt: "", error: "" };
let state: EarthMcPresence = empty;
const listeners = new Set<() => void>();
let ids = new Set<string>(),
  names = new Set<string>(),
  generation = 0;
let running = false,
  pending: Promise<void> | null = null,
  expiry: ReturnType<typeof setTimeout> | null = null;
export const presenceSnapshot = () => state;
export const subscribePresence = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(next: EarthMcPresence) {
  state = next;
  ids = new Set(
    (next.players || []).map((p) => p.uuid.toLowerCase().replaceAll("-", "")),
  );
  names = new Set((next.players || []).map((p) => p.name.toLowerCase()));
  listeners.forEach((listener) => listener());
}
export function isEarthMcOnline(uuid?: string, username = "") {
  return uuid
    ? ids.has(uuid.toLowerCase().replaceAll("-", ""))
    : names.has(username.toLowerCase());
}
export function useEarthMcPresence() {
  return useSyncExternalStore(subscribePresence, presenceSnapshot, () => empty);
}
export function filterOnlinePlayers<T extends { uuid: string; name: string }>(
  players: T[],
  online: EarthMcPresence["players"],
) {
  const onlineIds = new Set(
    (online || []).map((p) => p.uuid.toLowerCase().replaceAll("-", "")),
  );
  return players.filter((p) =>
    onlineIds.has(p.uuid.toLowerCase().replaceAll("-", "")),
  );
}
export function refreshEarthMcPresence(): Promise<void> {
  if (!running || document.visibilityState === "hidden" || (typeof navigator !== "undefined" && navigator.onLine === false))
    return Promise.resolve();
  if (pending) return pending;
  const current = generation;
  pending = apiRequest<{
    players: { uuid: string; name: string }[];
    checkedAt: string;
  }>("/api/earthmc/online", { networkOnly: true })
    .then((result) => {
      if (current !== generation) return;
      const age = Date.now() - Date.parse(result.checkedAt);
      if (
        !Array.isArray(result.players) ||
        !Number.isFinite(age) ||
        age > 65000 ||
        age < -60000
      )
        throw Error("Online status is unavailable. Please refresh.");
      if (expiry) clearTimeout(expiry);
      publish({ ...result, error: "" });
      expiry = setTimeout(
        () => {
          if (current === generation)
            publish({
              ...empty,
              error: "Online status is unavailable. Please refresh.",
            });
        },
        Math.max(1, 65000 - Math.max(0, age)),
      );
    })
    .catch(() => {
      if (current === generation) {
        if (expiry) clearTimeout(expiry);
        publish({
          ...empty,
          error: "Online status is temporarily unavailable.",
        });
      }
    })
    .finally(() => {
      if (current === generation) pending = null;
    });
  return pending;
}
export function startEarthMcPresence(enabled: boolean) {
  generation++;
  running = enabled;
  pending = null;
  if (expiry) clearTimeout(expiry);
  publish(empty);
  if (!enabled) return;
  const stopPolling = startBackgroundPolling(refreshEarthMcPresence);
  const changed = () => {
    if (document.visibilityState === "hidden") {
      generation++;pending=null;
      if (expiry) clearTimeout(expiry);
      publish(empty);
    }
  };
  const disconnected = () => {
    generation++;pending=null;
    if (expiry) clearTimeout(expiry);
    publish({ ...empty, error: "Online status is unavailable while offline." });
  };
  document.addEventListener("visibilitychange", changed);
  window.addEventListener("offline", disconnected);
  return () => {
    generation++;
    running = false;
    pending = null;
    stopPolling();
    if (expiry) clearTimeout(expiry);
    document.removeEventListener("visibilitychange", changed);
    window.removeEventListener("offline", disconnected);
    publish(empty);
  };
}
