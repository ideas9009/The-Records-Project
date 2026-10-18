import { useState } from "react";
import "./minecraft-face.css";
export default function MinecraftFace({
  username,
  uuid,
  className = "",
  eager = false,
}: {
  username: string;
  uuid?: string;
  className?: string;
  eager?: boolean;
}) {
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
    ? "https://mc-heads.net/avatar/" + encodeURIComponent(identifier) + "/96"
    : null;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={"minecraft-face " + className}
      role="img"
      aria-label={username + " Minecraft face"}
    >
      <span aria-hidden="true">{username.slice(0, 2).toUpperCase()}</span>
      {src && failed !== src && (
        <img
          key={src}
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      )}
    </span>
  );
}
