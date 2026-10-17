import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  applyAppearance,
  savedScale,
  savedPotato,
} from "../src/lib/appearance";
import {
  restoreWallpaper,
  selectWallpaper,
  wallpapers,
} from "../src/lib/wallpaper";
let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => saved.set(k, v),
    removeItem: (k: string) => saved.delete(k),
  });
  vi.stubGlobal("document", {
    documentElement: {
      dataset: {},
      style: { fontSize: "", setProperty: vi.fn() },
    },
    body: { style: { backgroundImage: "" } },
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe("appearance preference persistence", () => {
  it("hides wallpaper in Potato Mode and restores the same choice afterwards", async () => {
    await selectWallpaper(wallpapers[2].url);
    saved.set("records-potato", "true");
    applyAppearance();
    await restoreWallpaper();
    expect(savedPotato()).toBe(true);
    expect(document.body.style.backgroundImage).toBe("");
    expect(saved.get("records-wallpaper")).toBe(wallpapers[2].url);
    saved.set("records-potato", "false");
    applyAppearance();
    await restoreWallpaper();
    expect(document.body.style.backgroundImage).toContain(wallpapers[2].url);
  });
  it("restores supported scale values and rejects invalid legacy values", () => {
    saved.set("records-zoom", "125");
    applyAppearance();
    expect(savedScale()).toBe(130);
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
      "--ui-scale",
      "1.3",
    );
    saved.set("records-zoom", "20");
    expect(savedScale()).toBe(20);
    saved.set("records-zoom", "180");
    expect(savedScale()).toBe(180);
    saved.set("records-zoom", "NaN");
    expect(savedScale()).toBe(100);
    saved.set("records-zoom", "10000");
    expect(savedScale()).toBe(100);
  });
});
