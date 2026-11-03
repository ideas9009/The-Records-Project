import { beforeEach, afterEach, it, expect, vi } from "vitest";
const platform = vi.hoisted(() => ({ desktop: false }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => platform.desktop }));
import {
  storedSession,
  storeSession,
  sessionRequestOptions,
} from "../src/lib/session-storage";
let temporary: Map<string, string>, durable: Map<string, string>;
const storage = (data: Map<string, string>) => ({
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => data.set(k, v),
  removeItem: (k: string) => data.delete(k),
});
beforeEach(() => {
  platform.desktop = false;
  temporary = new Map();
  durable = new Map();
  vi.stubGlobal("sessionStorage", storage(temporary));
  vi.stubGlobal("localStorage", storage(durable));
});
afterEach(() => vi.unstubAllGlobals());
it("keeps desktop sign-in when the window session is recreated", () => {
  platform.desktop = true;
  storeSession("app-token");
  temporary.clear();
  expect(storedSession()).toBe("app-token");
  expect(sessionRequestOptions()).toEqual({ rememberSession: true });
});
it("desktop logout removes the remembered and legacy window tokens", () => {
  platform.desktop = true;
  storeSession("app-token");
  temporary.set("records-server-session", "old-token");
  storeSession(null);
  expect(storedSession()).toBeNull();
  expect(durable.size).toBe(0);
  expect(temporary.size).toBe(0);
});
it("website sign-in ends with the tab and never restores a desktop token", () => {
  durable.set("records-desktop-session", "desktop-only");
  storeSession("web-token");
  expect(storedSession()).toBe("web-token");
  temporary.clear();
  expect(storedSession()).toBeNull();
  expect(sessionRequestOptions()).toEqual({});
  expect(durable.get("records-desktop-session")).toBe("desktop-only");
});
