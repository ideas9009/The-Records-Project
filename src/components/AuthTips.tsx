import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Lightbulb } from "lucide-react";
import "./auth-tips.css";
const commonTips = [
  { text: "Choose Start tutorial in Settings for a guided tour of the app." },
  {
    text: "Click an Overview chart to expand it, then hover a bar to see the town’s values.",
  },
  {
    text: "Open About → Changelog to revisit release notes for earlier versions.",
  },
  {
    text: "Town Registry and Citizens both have EarthMC views for live public records.",
  },
];
const desktopTips = [
  {
    shortcut: "Alt+Q",
    text: "opens Quick Search for EarthMC players, towns and nations after sign-in.",
  },
  {
    shortcut: "Alt+Shift+Q",
    text: "opens Quick Rhōmaíōn for AI help after sign-in.",
  },
  {
    shortcut: "Ctrl+click Refresh",
    text: "Reload the Windows app and request a fresh data sync.",
  },
];
export const authTips = (
  native: boolean,
): { shortcut?: string; text: string }[] =>
  native ? [...desktopTips, ...commonTips] : commonTips;
export default function AuthTips() {
  const tips = authTips(isTauri());
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * tips.length),
  );
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (!document.hidden)
        timer = setInterval(() => setIndex((i) => (i + 1) % tips.length), 8000);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [tips.length]);
  const tip = tips[index % tips.length];
  return (
    <aside className="auth-tips" aria-label="Helpful tip" aria-live="off">
      <Lightbulb size={17} aria-hidden="true" />
      <span className="auth-tip-label">Did you know?</span>
      <p key={index} className="auth-tip-copy">
        {tip.shortcut && <kbd>{tip.shortcut}</kbd>}
        {tip.shortcut ? " " + tip.text : tip.text}
      </p>
    </aside>
  );
}
