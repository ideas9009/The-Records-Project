import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  wallpapers,
  restoreWallpaper,
  selectWallpaper,
} from "../src/lib/wallpaper";
let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => saved.get(k) || null,
    setItem: (k: string, v: string) => saved.set(k, v),
    removeItem: (k: string) => saved.delete(k),
  });
  vi.stubGlobal("document", {
    documentElement: { dataset: {} },
    body: { style: { backgroundImage: "" } },
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe("folder wallpaper collection", () => {
  it("restores a selected gallery wallpaper after reopening", async () => {
    await selectWallpaper(wallpapers[0].url);
    document.body.style.backgroundImage = "";
    await restoreWallpaper();
    expect(document.body.style.backgroundImage).toContain(wallpapers[0].url);
    expect(document.documentElement.dataset.wallpaper).toBe("true");
  });
  it("preserves selections from the previous three-image gallery", async () => {
    saved.set("records-wallpaper", wallpapers[0].legacyUrl);
    await restoreWallpaper();
    expect(saved.get("records-wallpaper")).toBe(wallpapers[0].url);
  });
  it("clears the removed upload mode instead of restoring it", async () => {
    saved.set("records-wallpaper", "local-image");
    await restoreWallpaper();
    expect(saved.has("records-wallpaper")).toBe(false);
    expect(document.body.style.backgroundImage).toBe("");
  });
  it("removes a wallpaper", async () => {
    await selectWallpaper(wallpapers[0].url);
    await selectWallpaper(null);
    await restoreWallpaper();
    expect(document.documentElement.dataset.wallpaper).toBe("false");
  });
  it("refuses files and URLs outside the gallery", async () => {
    await expect(
      selectWallpaper("https://example.com/image.png"),
    ).rejects.toThrow("gallery");
    await expect(
      selectWallpaper("/wallpapers/nonexistent.webp"),
    ).rejects.toThrow("gallery");
  });
});
