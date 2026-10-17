import catalog from "./wallpapers.json";
export const wallpapers = catalog;
function show(url: string | null) {
  document.documentElement.dataset.wallpaper = String(!!url);
  document.body.style.backgroundImage = url && document.documentElement.dataset.potato !== "true"
    ? `url(${JSON.stringify(url)})`
    : "";
}
export async function restoreWallpaper() {
  const saved = localStorage.getItem("records-wallpaper");
  const image = wallpapers.find(
    (w) => w.url === saved || w.legacyUrl === saved,
  );
  if (image) {
    localStorage.setItem("records-wallpaper", image.url);
    localStorage.setItem("records-wallpaper-name", image.name);
  } else {
    localStorage.removeItem("records-wallpaper");
    localStorage.removeItem("records-wallpaper-name");
  }
  show(image?.url || null);
}
export async function selectWallpaper(url: string | null) {
  const image = url ? wallpapers.find((w) => w.url === url) : undefined;
  if (url && !image) throw Error("Choose a wallpaper from the gallery.");
  if (image) {
    localStorage.setItem("records-wallpaper", image.url);
    localStorage.setItem("records-wallpaper-name", image.name);
  } else {
    localStorage.removeItem("records-wallpaper");
    localStorage.removeItem("records-wallpaper-name");
  }
  show(image?.url || null);
  window.dispatchEvent(new Event("records-wallpaper"));
}
