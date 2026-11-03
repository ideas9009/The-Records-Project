import { useEffect, useState } from "react";
import { Spinner, LoadingStatus } from "../components/Loading";
import {
  desktopPacksAvailable,
  widgetError,
  readWidgetPack,
  installWidgetPack,
  type WidgetPack,
} from "../lib/desktop-widgets";
import "./ExpansionPacks.css";
export default function ExpansionPacks({
  go,
}: {
  go?: (page: string) => void;
}) {
  const desktop = desktopPacksAvailable();
  const [pack, setPack] = useState<WidgetPack | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [installing, setInstalling] = useState(false),
    [removing, setRemoving] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    const load = () =>
      void readWidgetPack()
        .then((value) => {
          if (active) setPack(value);
        })
        .catch((reason) => {
          if (active) setError(widgetError(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [desktop]);
  if (!desktop)
    return (
      <section className="card">
        <h1>Expansion Packs</h1>
        <p>Expansion Packs are only available in the desktop app.</p>
      </section>
    );
  async function install(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setInstalling(enabled);
    setRemoving(!enabled);
    try {
      const [next] = await Promise.all([
        installWidgetPack(enabled),
        new Promise((resolve) => setTimeout(resolve, 750)),
      ]);
      setPack(next);
    } catch (reason) {
      setError(widgetError(reason));
    } finally {
      setBusy(false);
      setInstalling(false);
      setRemoving(false);
    }
  }
  return (
    <div className="expansion-packs">
      <header className="page-header page-banner">
        <h1>Expansion Packs</h1>
        <span className="badge">Desktop</span>
      </header>
      {error && (
        <p className="card" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <LoadingStatus>Loading expansion packs…</LoadingStatus>
      ) : (
        <>
          <section className="card pack-feature">
            <div className="pack-art" aria-hidden="true">
              <span className="material-symbol">widgets</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="pack-description">
              <span className="pack-tag">Included pack · Beta</span>
              <h2>Desktop Widgets <span className="pack-tag">Beta</span></h2>
              <p>
                Desktop Widgets is in beta; appearance may vary between placement modes. Add tiles for
                VoteParty, your nation’s balance, and online players.
              </p>
              <p className="pack-note">
                Choose desktop-only or always-on-top overlay mode. Size each
                widget from 1×1 to 3×3, in half-unit steps.
              </p>
            </div>
            <div className="pack-install">
              <span className={pack?.installed ? "pack-installed" : "pack-tag"}>
                {pack?.installed ? "Enabled" : "Disabled"}
              </span>
              <button
                className="pack-primary"
                disabled={busy}
                onClick={() => void install(!pack?.installed)}
              >
                {(installing || removing) && <Spinner />}
                {installing || removing
                  ? installing
                    ? "Enabling…"
                    : "Disabling…"
                  : pack?.installed
                    ? "Disable"
                    : "Enable"}
              </button>
            </div>
            {installing && (
              <div className="pack-install-progress" role="status">
                <span>Enabling Desktop Widgets…</span>
                <progress aria-label="Enabling Desktop Widgets" />
              </div>
            )}
          </section>
          {pack?.installed && (
            <section className="card widget-pack-options">
              <div>
                <h2>Your widgets are ready</h2>
                <p>
                  Add widgets and manage locking, appearance, snapping and
                  window pinning in Settings → Desktop Widgets.
                </p>
              </div>
              <button onClick={() => go?.("settings:widgets")}>
                Manage widgets
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
