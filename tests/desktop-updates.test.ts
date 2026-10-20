import { APP_BUILD } from "../src/lib/app-build";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  callback: null as null | ((event: { payload: unknown }) => void),
  stop: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mock.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mock.listen }));
beforeEach(() => {
  vi.resetModules();
  mock.invoke.mockReset();
  mock.stop.mockReset();
  mock.callback = null;
  mock.listen.mockImplementation(async (_name, fn) => {
    mock.callback = fn;
    return mock.stop;
  });
  const events = new EventTarget();
  vi.stubGlobal("window", Object.assign(events, { __TAURI_INTERNALS__: {} }));
  vi.stubGlobal("navigator", { onLine: true });
  mock.invoke.mockImplementation(async (name) =>
    name === "desktop_update_status"
      ? { stage: "idle" }
      : name === "desktop_update_check"
        ? { stage: "available", version: "2.0.1" }
        : { stage: "ready", version: "2.0.0" },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("checks at startup and on reconnect, then removes listeners", async () => {
  const u = await import("../src/lib/desktop-updates");
  const stop = u.startDesktopUpdates();
  await vi.waitFor(() =>
    expect(mock.invoke).toHaveBeenCalledWith("desktop_update_check", { buildNumber: APP_BUILD }),
  );
  expect(u.updateSnapshot().stage).toBe("available");
  window.dispatchEvent(new Event("online"));
  await vi.waitFor(() =>
    expect(
      mock.invoke.mock.calls.filter(
        (call) => call[0] === "desktop_update_check",
      ),
    ).toHaveLength(2),
  );
  stop();
  window.dispatchEvent(new Event("online"));
  expect(mock.stop).toHaveBeenCalledOnce();
  expect(
    mock.invoke.mock.calls.filter((call) => call[0] === "desktop_update_check"),
  ).toHaveLength(2);
});
it("uses native progress events and honours dirty-form guards before install", async () => {
  const u = await import("../src/lib/desktop-updates");
  const stop = u.startDesktopUpdates();
  await vi.waitFor(() => expect(u.updateSnapshot().stage).toBe("available"));
  mock.callback!({ payload: { stage: "downloading", received: 5, total: 10 } });
  expect(u.updateSnapshot().received).toBe(5);
  mock.callback!({ payload: { stage: "ready", version: "2.0.1" } });
  let proceed: (() => void) | undefined;
  const guard = (event: Event) => {
    event.preventDefault();
    proceed = (event as CustomEvent).detail.proceed;
  };
  window.addEventListener("records-navigate", guard);
  u.installDesktopUpdate({} as HTMLElement);
  expect(
    mock.invoke.mock.calls.some((c) => c[0] === "desktop_update_install"),
  ).toBe(false);
  proceed!();
  await vi.waitFor(() =>
    expect(mock.invoke).toHaveBeenCalledWith(
      "desktop_update_install",
      undefined,
    ),
  );
  window.removeEventListener("records-navigate", guard);
  stop();
});
it("reinstall uses its own action and does not install automatically", async () => {
  const u = await import("../src/lib/desktop-updates");
  await u.downloadDesktopUpdate(true);
  expect(mock.invoke).toHaveBeenCalledWith("desktop_update_download", {
    reinstall: true,
    buildNumber: APP_BUILD,
  });
  expect(u.updateSnapshot().reinstall).toBe(true);
  expect(
    mock.invoke.mock.calls.some((c) => c[0] === "desktop_update_install"),
  ).toBe(false);
});
it("does not call desktop commands from the website", async () => {
  vi.stubGlobal("window", new EventTarget());
  const u = await import("../src/lib/desktop-updates");
  const stop = u.startDesktopUpdates();
  await u.checkDesktopUpdates();
  expect(mock.invoke).not.toHaveBeenCalled();
  expect(u.showUpdatePrompt(u.updateSnapshot())).toBe(false);
  stop();
});
