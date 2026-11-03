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

it('developer preview opens the prompt, simulates progress and cannot download or install',async()=>{
 const u=await import('../src/lib/desktop-updates');const owner={uid:'cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67',status:'approved'} as import('../src/lib/cloud-auth').Account;
 const opened=vi.fn();window.addEventListener('records-open-update',opened);
 vi.useFakeTimers();try{expect(u.previewDesktopUpdate(owner)).toBe(true);expect(opened).toHaveBeenCalledOnce();expect(u.updateSnapshot().demo).toBe(true);await u.downloadDesktopUpdate();await vi.advanceTimersByTimeAsync(5000);expect(u.updateSnapshot().stage).toBe('ready');u.installDesktopUpdate({} as HTMLElement);expect(mock.invoke).not.toHaveBeenCalled();u.dismissUpdatePreview();expect(u.updateSnapshot().stage).toBe('idle');expect(u.updateSnapshot().demo).toBeFalsy();}finally{u.dismissUpdatePreview();vi.useRealTimers();}
});
it('preview requires the exact approved developer account in the app',async()=>{
 const u=await import('../src/lib/desktop-updates');const owner={uid:'cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67',status:'approved'} as import('../src/lib/cloud-auth').Account;
 expect(u.previewDesktopUpdate()).toBe(false);expect(u.previewDesktopUpdate({...owner,uid:'another-operator'})).toBe(false);expect(u.previewDesktopUpdate({...owner,status:'pending'})).toBe(false);
 vi.stubGlobal('window',new EventTarget());expect(u.previewDesktopUpdate(owner)).toBe(false);expect(u.updateSnapshot().stage).toBe('idle');expect(mock.invoke).not.toHaveBeenCalled();
});
it('ending a preview restores the real update and does not replace a ready installer',async()=>{
 const u=await import('../src/lib/desktop-updates');const owner={uid:'cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67',status:'approved'} as import('../src/lib/cloud-auth').Account;
 await u.checkDesktopUpdates();const real=u.updateSnapshot();expect(u.previewDesktopUpdate(owner)).toBe(true);u.dismissUpdatePreview();expect(u.updateSnapshot()).toEqual(real);
 await u.downloadDesktopUpdate();expect(u.updateSnapshot().stage).toBe('ready');expect(u.previewDesktopUpdate(owner)).toBe(false);expect(u.updateSnapshot().demo).toBeFalsy();
});

it('reminder preview shows availability without opening the expanded prompt or calling the updater',async()=>{
 const u=await import('../src/lib/desktop-updates');const owner={uid:'cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67',status:'approved'} as import('../src/lib/cloud-auth').Account;
 const reminder=vi.fn(),prompt=vi.fn();window.addEventListener('records-preview-update-reminder',reminder);window.addEventListener('records-open-update',prompt);
 expect(u.previewDesktopUpdate(owner,'reminder')).toBe(true);expect(reminder).toHaveBeenCalledOnce();expect(prompt).not.toHaveBeenCalled();expect(u.showUpdatePrompt(u.updateSnapshot())).toBe(true);expect(u.updateSnapshot().stage).toBe('available');expect(mock.invoke).not.toHaveBeenCalled();u.dismissUpdatePreview();
});

it('keeps public release names through progress events while numeric tags stay internal',async()=>{const u=await import('../src/lib/desktop-updates');const stop=u.startDesktopUpdates();try{await vi.waitFor(()=>expect(u.updateSnapshot().stage).toBe('available'));mock.callback!({payload:{stage:'available',version:'5',releaseName:'Nostra-2'}});for(const stage of ['downloading','verifying','ready']){mock.callback!({payload:{stage,version:'5'}});expect(u.updateSnapshot().releaseName).toBe('Nostra-2');expect(u.updateSnapshot().version).toBe('5');}}finally{stop();}});
