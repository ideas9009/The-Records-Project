import { useEarthMcPresence, isEarthMcOnline } from "../lib/earthmc-presence";
import { useState } from "react";
import "./minecraft-face.css";
export default function MinecraftFace({
  username,
  uuid,
  className = "",
  eager = false,
  variant = "face",
}: {
  username: string;
  uuid?: string;
  className?: string;
  eager?: boolean;
  variant?: "face" | "body";
}) {
  useEarthMcPresence();
  const online = isEarthMcOnline(uuid, username);
  const identifier =
    uuid &&
    /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
      uuid,
    )
      ? uuid
      : /^[A-Za-z0-9_]{3,16}$/.test(username)
        ? username
        : null;
  const src = identifier
    ? "https://mc-heads.net/" +
      (variant === "body" ? "body/" : "avatar/") +
      encodeURIComponent(identifier) +
      (variant === "body" ? "/220" : "/96")
    : null;
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <span
      className={
        "minecraft-face " +
        (variant === "body" ? "minecraft-body " : "") +
        className
      }
      role="img"
      aria-label={
        username +
        (variant === "body" ? " 3D Minecraft character" : " Minecraft face") +
        (online ? " — online on EarthMC" : "")
      }
    >
      <span
        aria-hidden="true"
        style={{ visibility: loaded === src ? "hidden" : "visible" }}
      >
        {username.slice(0, 2).toUpperCase()}
      </span>
      {online && variant === "face" && (
        <span className="minecraft-online-dot" aria-hidden="true" />
      )}
      {src && failed !== src && (
        <img
          key={src}
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(src)}
          onError={() => {
            setLoaded(null);
            setFailed(src);
          }}
        />
      )}
    </span>
  );
}
