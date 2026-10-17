import { useState } from "react";
import { sections, stored, preference } from "./lib/preferences";
import { label } from "./lib/model";
import { useApp } from "./ui";
export default function Customization() {
  const { run } = useApp(),
    [hidden, setHidden] = useState<string[]>(stored("records-hidden", [])),
    [order, setOrder] = useState<string[]>(
      stored("records-nav-order", sections),
    ),
    [nav, setNav] = useState(stored("records-nav-mode", "sidebar")),
    [shortcuts, setShortcuts] = useState<Record<string, string>>(
      stored("records-shortcuts", {}),
    ),
    [hero, setHero] = useState(stored("records-hero", true)),
    [stats, setStats] = useState(stored("records-stats", true));
  const writeHidden = (v: string[]) => {
    setHidden(v);
    preference("records-hidden", v);
  };
  const move = (i: number, d: number) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
    preference("records-nav-order", next);
  };
  return (
    <>
      <section className="card">
        <h2>Navigation & dashboard</h2>
        <label className="toggle">
          Navigation placement
          <select
            value={nav}
            onChange={(e) => {
              setNav(e.target.value);
              preference("records-nav-mode", e.target.value);
            }}
          >
            <option value="sidebar">Sidebar</option>
            <option value="topbar">Top navigation</option>
          </select>
        </label>
        <label className="toggle">
          Show workspace shortcuts
          <input
            type="checkbox"
            checked={hero}
            onChange={(e) => {
              setHero(e.target.checked);
              preference("records-hero", e.target.checked);
            }}
          />
        </label>
        <label className="toggle">
          Show overview statistics
          <input
            type="checkbox"
            checked={stats}
            onChange={(e) => {
              setStats(e.target.checked);
              preference("records-stats", e.target.checked);
            }}
          />
        </label>
        {order.map((id, i) => (
          <div className="preference-row" key={id}>
            <input
              aria-label={"Show " + id}
              type="checkbox"
              checked={!hidden.includes(id)}
              disabled={["home", "settings"].includes(id)}
              onChange={(e) =>
                writeHidden(
                  e.target.checked
                    ? hidden.filter((v) => v !== id)
                    : [...hidden, id],
                )
              }
            />
            <span>{label(id)}</span>
            <button
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={"Move " + id + " up"}
            >
              ↑
            </button>
            <button
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
              aria-label={"Move " + id + " down"}
            >
              ↓
            </button>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Keyboard controls</h2>
        <p>
          Assign a letter or number to each page. Hold Alt when using the
          shortcut.
        </p>
        {sections.map((id) => (
          <label className="preference-row" key={id}>
            <span>{label(id)}</span>
            <input
              aria-label={"Shortcut for " + id}
              maxLength={1}
              value={shortcuts[id] || ""}
              onChange={(e) => {
                const key = e.target.value.toLowerCase();
                const next = { ...shortcuts, [id]: key };
                if (
                  key &&
                  Object.entries(shortcuts).some(
                    ([page, v]) => page !== id && v === key,
                  )
                )
                  return;
                setShortcuts(next);
                preference("records-shortcuts", next);
              }}
            />
          </label>
        ))}
        <div className="actions">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(shortcuts, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "records-shortcuts.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export shortcuts
          </button>
          <label className="file-input">
            Import shortcuts
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  run(async () => {
                    const data = JSON.parse(await file.text());
                    if (
                      !data ||
                      Array.isArray(data) ||
                      typeof data !== "object"
                    )
                      throw Error("Invalid shortcut file");
                    const next: Record<string, string> = {};
                    for (const [page, key] of Object.entries(data)) {
                      if (
                        !sections.includes(page) ||
                        typeof key !== "string" ||
                        key.length > 1
                      )
                        throw Error("Invalid shortcut");
                      next[page] = key;
                    }
                    setShortcuts(next);
                    preference("records-shortcuts", next);
                  });
              }}
            />
          </label>
        </div>
      </section>
    </>
  );
}
