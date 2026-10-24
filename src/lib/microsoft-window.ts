import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { microsoftAuthorizationUrl } from "./microsoft";
export type MicrosoftLocation = "app" | "browser";
const key = "records-microsoft-signin-location";
export function savedMicrosoftLocation(): MicrosoftLocation {
  try {
    return localStorage.getItem(key) === "browser" ? "browser" : "app";
  } catch {
    return "app";
  }
}
export function saveMicrosoftLocation(value: MicrosoftLocation) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The selection still applies to this sign-in. */
  }
}
export async function openMicrosoftDesktop(
  raw: string,
  location: MicrosoftLocation,
) {
  const url = microsoftAuthorizationUrl(raw);
  if (!isTauri())
    throw Error("Desktop Microsoft sign-in is only available in the app.");
  if (location === "browser") {
    await closeMicrosoftDesktop().catch(() => {});
    await openUrl(url);
  } else await invoke("open_microsoft_signin", { url });
}
export async function closeMicrosoftDesktop() {
  if (isTauri()) await invoke("close_microsoft_signin");
}
