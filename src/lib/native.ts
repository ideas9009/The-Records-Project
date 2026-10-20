import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
export async function external(url: string) {
  if (!/^https:\/\//i.test(url)) throw Error("Only HTTPS links can be opened.");
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
export async function earthmc(endpoint: string, names: string[] = []) {
  if (isTauri()) return invoke<any>("earthmc", { endpoint, names });
  const r = await fetch("https://api.earthmc.net/v4" + endpoint, {
    method: names.length ? "POST" : "GET",
    signal: AbortSignal.timeout(20000),
    headers: names.length ? { "Content-Type": "application/json" } : {},
    ...(names.length ? { body: JSON.stringify({ query: names }) } : {}),
  });
  if (!r.ok) throw Error("EarthMC returned " + r.status);
  return r.json();
}
export async function panel(page: string) {
  if (isTauri()) await invoke("open_panel", { page });
  else
    window.open(
      "/?panel=" + encodeURIComponent(page),
      "_blank",
      "width=900,height=720",
    );
}
