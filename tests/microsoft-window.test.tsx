import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  openUrl: vi.fn(),
  desktop: true,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  isTauri: () => native.desktop,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: native.openUrl }));
import {
  openMicrosoftDesktop,
  savedMicrosoftLocation,
  saveMicrosoftLocation,
} from "../src/lib/microsoft-window";
import MicrosoftVerification from "../src/components/MicrosoftVerification";
const url =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?state=test";
beforeEach(() => {
  native.desktop = true;
  native.invoke.mockReset().mockResolvedValue(undefined);
  native.openUrl.mockReset().mockResolvedValue(undefined);
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("defaults to the app window and saves only a location preference", () => {
  expect(savedMicrosoftLocation()).toBe("app");
  saveMicrosoftLocation("browser");
  expect(savedMicrosoftLocation()).toBe("browser");
});
it("opens the native window for app sign-in", async () => {
  await openMicrosoftDesktop(url, "app");
  expect(native.invoke).toHaveBeenCalledWith("open_microsoft_signin", { url });
  expect(native.openUrl).not.toHaveBeenCalled();
});
it("browser fallback works even if an older native app cannot close the window", async () => {
  native.invoke.mockRejectedValueOnce(Error("Unknown command"));
  await openMicrosoftDesktop(url, "browser");
  expect(native.openUrl).toHaveBeenCalledWith(url);
});
it("rejects untrusted authorization addresses before invoking native functions", async () => {
  await expect(
    openMicrosoftDesktop("https://attacker.invalid/signin", "app"),
  ).rejects.toThrow();
  expect(native.invoke).not.toHaveBeenCalled();
  expect(native.openUrl).not.toHaveBeenCalled();
});
it("offers a saved app/browser choice only in desktop builds", () => {
  saveMicrosoftLocation("browser");
  const html = renderToStaticMarkup(<MicrosoftVerification mode="link" />);
  expect(html).toContain("Microsoft sign-in location");
  expect(html).toContain('value="browser" selected');
  native.desktop = false;
  expect(
    renderToStaticMarkup(<MicrosoftVerification mode="link" />),
  ).not.toContain("Microsoft sign-in location");
});
