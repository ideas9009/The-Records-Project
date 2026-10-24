import { useEffect, useState, type CSSProperties } from "react";
import { wallpapers } from "../lib/wallpaper";
import {
  WALLPAPER_FADE_MS,
  WALLPAPER_HOLD_MS,
  startWallpaperCycle,
} from "../lib/auth-wallpaper-cycle";
import "./auth-wallpapers.css";
function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  return image.decode();
}
export default function AuthWallpapers() {
  const [frames, setFrames] = useState<{
    urls: [string, string];
    front: number;
  } | null>(null);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const urls = wallpapers.map((image) => image.authUrl);
    const saved = localStorage.getItem("records-wallpaper");
    const start = Math.max(
      0,
      wallpapers.findIndex(
        (image) => image.url === saved || image.legacyUrl === saved,
      ),
    );
    let stop = () => {},
      disposed = false,
      cursor = start;
    const refresh = () => {
      stop();
      if (document.documentElement.dataset.potato === "true") {
        setFrames(null);
        return;
      }
      setFrames(
        (previous) =>
          previous ??
          (urls.length ? { urls: [urls[start], urls[start]], front: 0 } : null),
      );
      if (motion.matches || document.hidden || !urls.length) return;
      stop = startWallpaperCycle(
        urls,
        cursor,
        (url) => {
          cursor = urls.indexOf(url);
          if (!disposed)
            setFrames((previous) => {
              if (!previous || previous.urls[previous.front] === url)
                return previous;
              const next: [string, string] = [...previous.urls];
              const front = 1 - previous.front;
              next[front] = url;
              return { urls: next, front };
            });
        },
        loadImage,
      );
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-potato"],
    });
    motion.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      motion.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [WALLPAPER_HOLD_MS, WALLPAPER_FADE_MS, startWallpaperCycle]);
  return (
    frames && (
      <div
        className="auth-wallpapers"
        aria-hidden="true"
        style={
          {
            "--wallpaper-fade-duration": WALLPAPER_FADE_MS + "ms",
          } as CSSProperties
        }
      >
        {frames.urls.map((url, index) => (
          <img
            key={index}
            src={url}
            alt=""
            decoding="async"
            className={frames.front === index ? "is-visible" : ""}
            draggable={false}
          />
        ))}
      </div>
    )
  );
}
