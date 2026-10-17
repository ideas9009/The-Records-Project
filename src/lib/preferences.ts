export function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function preference(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("records-preferences"));
}
export const sections = [
  "home",
  "towns",
  "citizens",
  "jobs",
  "shops",
  "companies",
  "nation",
  "mayor",
  "wallet",
  "chat",
  "live",
  "analytics",
  "profile",
  "admin",
  "expansions",
  "settings",
];
