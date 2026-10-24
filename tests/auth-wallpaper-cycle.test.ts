import { afterEach, expect, it, vi } from "vitest";
import { startWallpaperCycle } from "../src/lib/auth-wallpaper-cycle";
afterEach(() => vi.useRealTimers());
it("holds each wallpaper for three seconds in addition to the fade", async () => {
  vi.useFakeTimers();
  const show = vi.fn();
  const load = vi.fn().mockResolvedValue(undefined);
  const stop = startWallpaperCycle(["a", "b", "c"], 0, show, load);
  await vi.advanceTimersByTimeAsync(2999);
  expect(show).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(show.mock.calls.map((call) => call[0])).toEqual(["b"]);
  await vi.advanceTimersByTimeAsync(3599);
  expect(show).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(show.mock.calls.map((call) => call[0])).toEqual(["b", "c"]);
  await vi.advanceTimersByTimeAsync(3600);
  expect(show.mock.calls.map((call) => call[0])).toEqual(["b", "c", "a"]);
  stop();
  await vi.advanceTimersByTimeAsync(3000);
  expect(show).toHaveBeenCalledTimes(3);
});
it("does not queue overlapping downloads or show a frame after unmount", async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const show = vi.fn();
  const load = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const stop = startWallpaperCycle(["a", "b"], 0, show, load);
  await vi.advanceTimersByTimeAsync(15000);
  expect(load).toHaveBeenCalledTimes(1);
  stop();
  resolve();
  await Promise.resolve();
  expect(show).not.toHaveBeenCalled();
});
it("skips failed images and keeps cycling", async () => {
  vi.useFakeTimers();
  const show = vi.fn();
  const load = vi
    .fn()
    .mockRejectedValueOnce(Error("missing"))
    .mockResolvedValue(undefined);
  const stop = startWallpaperCycle(["a", "b", "c"], 0, show, load);
  await vi.advanceTimersByTimeAsync(6000);
  expect(show.mock.calls.map((call) => call[0])).toEqual(["c"]);
  stop();
});
