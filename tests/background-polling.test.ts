import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {BACKGROUND_SYNC_MS, startBackgroundPolling} from "../src/lib/background-polling";
let doc: EventTarget & {visibilityState: string};
let win: EventTarget;
let stop: (()=>void) | undefined;
beforeEach(()=>{
  vi.useFakeTimers();
  doc=Object.assign(new EventTarget(),{visibilityState:"visible"});
  win=new EventTarget();
  vi.stubGlobal("document",doc);
  vi.stubGlobal("window",win);
  vi.stubGlobal("navigator",{onLine:true});
});
afterEach(()=>{stop?.();stop=undefined;vi.useRealTimers();vi.unstubAllGlobals()});
describe("background sync request budget",()=>{
  it("loads initially, waits ten minutes, and does not refresh on repeated focus events",async()=>{
    const load=vi.fn();stop=startBackgroundPolling(load);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    for(let i=0;i<5;i++)win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_MS-1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("pauses while hidden or offline and refreshes once when due and visible again",async()=>{
    const load=vi.fn();stop=startBackgroundPolling(load);
    await vi.advanceTimersByTimeAsync(0);
    doc.visibilityState="hidden";
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_MS*2);
    expect(load).toHaveBeenCalledTimes(1);
    vi.stubGlobal("navigator",{onLine:false});doc.visibilityState="visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(load).toHaveBeenCalledTimes(1);
    vi.stubGlobal("navigator",{onLine:true});win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("keeps failures on the ten-minute schedule instead of retrying on focus",async()=>{
    const load=vi.fn().mockRejectedValue(Error("quota"));stop=startBackgroundPolling(load);
    await vi.advanceTimersByTimeAsync(0);
    win.dispatchEvent(new Event("focus"));win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_MS-1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not overlap requests and stops all triggers after cleanup",async()=>{
    let finish!:()=>void;
    const load=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}));stop=startBackgroundPolling(load);
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_MS*2);
    expect(load).toHaveBeenCalledTimes(1);
    finish();await vi.advanceTimersByTimeAsync(0);
    stop();stop=undefined;
    win.dispatchEvent(new Event("focus"));doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_MS);
    expect(load).toHaveBeenCalledTimes(1);
  });
});