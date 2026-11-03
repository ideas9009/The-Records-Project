import { isTauri } from "@tauri-apps/api/core";
const temporaryKey = "records-server-session";
const desktopKey = "records-desktop-session";
// Browser sessions stay in their tab; only the native app uses durable storage.
export const storedSession = () =>
  isTauri()
    ? localStorage.getItem(desktopKey) || sessionStorage.getItem(temporaryKey)
    : sessionStorage.getItem(temporaryKey);
export function storeSession(token: string | null) {
  if (isTauri()) {
    if (token) localStorage.setItem(desktopKey, token);
    else localStorage.removeItem(desktopKey);
    sessionStorage.removeItem(temporaryKey);
  } else {
    if (token) sessionStorage.setItem(temporaryKey, token);
    else sessionStorage.removeItem(temporaryKey);
  }
}
export const sessionRequestOptions = () =>
  isTauri() ? { rememberSession: true } : {};
