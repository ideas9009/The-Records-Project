import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ native: false, label: "main" }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => state.native }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: state.label }) }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({ account: { uid: "member", status: "approved" } }),
}));
vi.mock("../src/lib/desktop-updates", () => ({
  checkDesktopUpdates: vi.fn(),
  useDesktopUpdate: () => ({ stage: "idle" }),
  updateBusy: () => false,
}));
import DesktopChrome from "../src/components/DesktopChrome";
import {
  guardPageAction,
  reloadDesktopApp,
  consumeDesktopResync,
} from "../src/lib/desktop-chrome";
beforeEach(() => {
  state.native = false;
  state.label = "main";
  const records = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => records.set(k, v),
    removeItem: (k: string) => records.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("leaves the website inside its normal browser window", () => {
  expect(
    renderToStaticMarkup(
      <DesktopChrome>
        <div>Website content</div>
      </DesktopChrome>,
    ),
  ).toBe("<div>Website content</div>");
});
it("provides native window controls and the shared toolbar around all app screens", () => {
  state.native = true;
  const html = renderToStaticMarkup(
    <DesktopChrome>
      <div>Sign in or workspace</div>
    </DesktopChrome>,
  );
  for (const name of [
    "Minimize window",
    "Maximize window",
    "Close window",
    "Check for updates",
    "Notifications",
    "Refresh page",
  ])
    expect(html).toContain('aria-label="' + name + '"');
  expect(html).toContain("Ctrl-click to reload the app and resync");
  expect(html).toContain("Sign in or workspace");
});
it("lets existing unsaved-change guards defer an action until confirmed", () => {
  const events = new EventTarget();
  vi.stubGlobal("window", { dispatchEvent: events.dispatchEvent.bind(events) });
  let resume = () => {};
  events.addEventListener("records-navigate", (e) => {
    e.preventDefault();
    resume = (e as CustomEvent).detail.proceed;
  });
  const close = vi.fn();
  guardPageAction(close);
  expect(close).not.toHaveBeenCalled();
  resume();
  expect(close).toHaveBeenCalledOnce();
});
it("normal actions proceed immediately when there are no unsaved edits", () => {
  const events = new EventTarget();
  vi.stubGlobal("window", { dispatchEvent: events.dispatchEvent.bind(events) });
  const refresh = vi.fn();
  guardPageAction(refresh);
  expect(refresh).toHaveBeenCalledOnce();
});
it("full reload schedules exactly one resync and does not remove the login", () => {
  const records = new Map([["records-desktop-session", "remembered"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => records.get(k) ?? null,
  });
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  reloadDesktopApp();
  expect(reload).toHaveBeenCalledOnce();
  expect(consumeDesktopResync()).toBe(true);
  expect(consumeDesktopResync()).toBe(false);
  expect(records.get("records-desktop-session")).toBe("remembered");
});

it("does not add duplicate controls to native secondary windows", () => {
  state.native = true;
  state.label = "panel-towns";
  expect(
    renderToStaticMarkup(
      <DesktopChrome>
        <div>Panel</div>
      </DesktopChrome>,
    ),
  ).toBe("<div>Panel</div>");
});
