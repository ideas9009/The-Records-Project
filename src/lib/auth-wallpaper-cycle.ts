export const WALLPAPER_HOLD_MS = 3000;
export const WALLPAPER_FADE_MS = 600;
export function startWallpaperCycle(
  urls: readonly string[],
  start: number,
  onFrame: (url: string) => void,
  load: (url: string) => Promise<void>,
) {
  let active = true,
    cursor = start,
    timer: ReturnType<typeof setTimeout>;
  if (urls.length < 2) return () => {};
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      cursor = (cursor + 1) % urls.length;
      let shown = false;
      try {
        const url = urls[cursor];
        await load(url);
        if (active) {
          onFrame(url);
          shown = true;
        }
      } catch {
        /* Retain the current wallpaper when an image cannot load. */
      }
      if (active) schedule(WALLPAPER_HOLD_MS + (shown ? WALLPAPER_FADE_MS : 0));
    }, delay);
  };
  schedule(WALLPAPER_HOLD_MS);
  return () => {
    active = false;
    clearTimeout(timer);
  };
}
