import { useState } from "react";
import { X, Check } from "lucide-react";
import { wallpapers, selectWallpaper } from "./lib/wallpaper";
import { useApp } from "./ui";
export default function WallpaperPicker() {
  const { run } = useApp(),
    [selected, setSelected] = useState(
      localStorage.getItem("records-wallpaper") || "",
    ),
    [busy, setBusy] = useState(false);
  async function choose(url: string | null) {
    setBusy(true);
    try {
      if (await run(() => selectWallpaper(url), "Wallpaper updated"))
        setSelected(url || "");
    } finally {
      setBusy(false);
    }
  }
  const current = wallpapers.find(
    (w) => w.url === selected || w.legacyUrl === selected,
  );
  return (
    <div className="wallpaper-control wide">
      <div className="section-title">
        <h3>Wallpaper</h3>
        <span className="badge">{wallpapers.length} wallpapers</span>
      </div>
      <p>Choose from The Records Project’s wallpaper collection.</p>
      <div className="wallpaper-options wallpaper-gallery">
        <button
          type="button"
          aria-pressed={!current}
          disabled={busy}
          className={!current ? "selected" : ""}
          onClick={() => choose(null)}
        >
          <span className="no-wallpaper">
            <X size={22} />
          </span>
          <span>No wallpaper</span>
        </button>
        {wallpapers.map((image) => (
          <button
            type="button"
            key={image.file}
            title={image.file}
            aria-label={"Use " + image.name}
            aria-pressed={current?.file === image.file}
            className={current?.file === image.file ? "selected" : ""}
            disabled={busy}
            onClick={() => choose(image.url)}
          >
            <img
              loading="lazy"
              decoding="async"
              src={image.thumbnail}
              alt={image.name}
            />
            <span>
              {current?.file === image.file && <Check size={13} />} {image.name}
            </span>
          </button>
        ))}
      </div>
      {current && (
        <small className="wallpaper-name">
          {current.name} · {current.file}
        </small>
      )}
    </div>
  );
}
