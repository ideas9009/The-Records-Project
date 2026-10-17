export const interfaceScale = { min: 20, max: 180, step: 10 } as const;
export function savedScale() {
  const value = Number(localStorage.getItem("records-zoom") || 100);
  return Number.isFinite(value) && value >= interfaceScale.min && value <= interfaceScale.max
    ? Math.round(value / interfaceScale.step) * interfaceScale.step
    : 100;
}
export function savedPotato() {
  return localStorage.getItem("records-potato") === "true";
}
export function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = "dark";
  root.dataset.potato = String(savedPotato());
  root.style.fontSize = "14px";
  root.style.setProperty("--accent", "#3b82f6");
  root.style.setProperty("--ui-scale", String(savedScale() / 100));
}
