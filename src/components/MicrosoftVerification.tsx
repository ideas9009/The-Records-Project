import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Spinner, LoadingStatus } from "./Loading";
import {
  startMicrosoft,
  pollMicrosoft,
  cancelMicrosoft,
  finishMicrosoft,
  microsoftConfig,
  microsoftAuthorizationUrl,
  goldBalance,
  type MicrosoftMode,
  type MicrosoftFlow,
  type MicrosoftReady,
} from "../lib/microsoft";
import "./microsoft-verification.css";
export function MicrosoftConfirmation({ ready }: { ready: MicrosoftReady }) {
  const p = ready.profile;
  return (
    <div className="microsoft-confirmation">
      <div className="microsoft-identity">
        <span
          className="minecraft-avatar"
          role="img"
          aria-label={p.username + " avatar"}
          style={
            p.avatar
              ? { backgroundImage: "url(" + JSON.stringify(p.avatar) + ")" }
              : undefined
          }
        >
          {!p.avatar && (
            <span className="material-symbol" aria-hidden="true">
              person
            </span>
          )}
        </span>
        <h3>{p.username}</h3>
      </div>
      <dl className="microsoft-facts">
        <div>
          <dt>Bank balance</dt>
          <dd>{goldBalance(p.balance)}</dd>
        </div>
        {p.isMayor && (
          <div>
            <dt>Town bank balance</dt>
            <dd>{goldBalance(p.townBalance)}</dd>
          </div>
        )}
        <div>
          <dt>Town</dt>
          <dd>{p.town.name}</dd>
        </div>
        <div>
          <dt>Nation</dt>
          <dd>{p.nation.name}</dd>
        </div>
        <div>
          <dt>Rank</dt>
          <dd>
            {p.ranks.length
              ? p.ranks.join(" · ")
              : p.isMayor
                ? "Mayor"
                : "Citizen"}
          </dd>
        </div>
      </dl>
      {!p.isMayor && !p.townRegistered && (
        <p className="microsoft-warning">
          <strong>Your town is awaiting registration</strong>Your mayor has not
          registered this town with The Records Project. You can continue as a
          Citizen. Your town will be linked automatically once your mayor
          registers it.
        </p>
      )}
    </div>
  );
}
export default function MicrosoftVerification({
  mode,
  onActiveChange,
}: {
  mode: MicrosoftMode;
  onActiveChange?: (active: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [checking, setChecking] = useState(true),
    [flow, setFlow] = useState<MicrosoftFlow | null>(null),
    [ready, setReady] = useState<MicrosoftReady | null>(null),
    [passwordStage, setPasswordStage] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(false);
  const active = useRef(true),
    popup = useRef<Window | null>(null),
    finishing = useRef(false);
  useEffect(() => onActiveChange?.(!!flow), [flow, onActiveChange]);
  useEffect(() => {
    active.current = true;
    let mounted = true;
    void microsoftConfig()
      .then((config) => {
        if (mounted) setEnabled(config.enabled);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => {
      mounted = false;
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setReady(null);
    setPasswordStage(false);
    setPassword("");
    setConfirmation("");
    setError("");
    if (flow) void cancelMicrosoft(flow).catch(() => {});
    setFlow(null);
  }, [mode]);
  useEffect(() => {
    if (!flow) return;
    let mounted = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const result = await pollMicrosoft(flow);
        if (!mounted) return;
        if (result.status === "failed") {
          setError(result.error || "Microsoft verification failed.");
          return;
        }
        if (result.status === "ready") {
          setReady(result);
          if (mode === "login" && !finishing.current) {
            finishing.current = true;
            setBusy(true);
            try {
              const done = await finishMicrosoft(
                flow,
                result.confirmationDigest,
              );
              if (done.confirmationChanged) {
                const updated = await pollMicrosoft(flow);
                if (mounted && updated.status === "ready") setReady(updated);
              }
            } catch (e) {
              if (mounted)
                setError(e instanceof Error ? e.message : "Could not sign in.");
            } finally {
              finishing.current = false;
              if (mounted) setBusy(false);
            }
          }
          return;
        }
        timer = setTimeout(() => void check(), 2000);
      } catch (e) {
        if (mounted)
          setError(
            e instanceof Error
              ? e.message
              : "Could not check Microsoft sign-in.",
          );
      }
    };
    void check();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [flow, mode]);
  async function start() {
    setError("");
    setOpening(true);
    setReady(null);
    setPasswordStage(false);
    setPassword("");
    setConfirmation("");
    let windowHandle: Window | null = null;
    if (!isTauri()) {
      windowHandle = window.open("about:blank", "_blank");
      if (windowHandle) windowHandle.opener = null;
      popup.current = windowHandle;
    }
    try {
      const next = await startMicrosoft(mode),
        url = microsoftAuthorizationUrl(next.url);
      if (!active.current) {
        void cancelMicrosoft(next).catch(() => {});
        return;
      }
      setFlow(next);
      if (isTauri()) await openUrl(url);
      else if (windowHandle) windowHandle.location.href = url;
    } catch (e) {
      windowHandle?.close();
      if (active.current)
        setError(
          e instanceof Error ? e.message : "Could not open Microsoft sign-in.",
        );
    } finally {
      if (active.current) setOpening(false);
    }
  }
  async function cancel() {
    if (flow) void cancelMicrosoft(flow).catch(() => {});
    setFlow(null);
    setReady(null);
    setError("");
    setPasswordStage(false);
    setPassword("");
    setConfirmation("");
    popup.current?.close();
    popup.current = null;
  }
  async function finish(e?: FormEvent) {
    e?.preventDefault();
    if (!flow || !ready || finishing.current) return;
    if (mode === "register" && password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    finishing.current = true;
    try {
      const done = await finishMicrosoft(
        flow,
        ready.confirmationDigest,
        mode === "register" ? password : undefined,
      );
      if (done.confirmationChanged) {
        const updated = await pollMicrosoft(flow);
        if (updated.status === "ready") setReady(updated);
        setPasswordStage(false);
        setError(
          "Your EarthMC information changed. Please confirm the updated profile.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete verification.",
      );
    } finally {
      finishing.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section
      className="microsoft-verification"
      aria-label="Microsoft verification"
    >
      {!flow ? (
        <>
          <button
            className="microsoft-button"
            disabled={checking || !enabled || opening}
            onClick={() => void start()}
          >
            {opening && <Spinner />}
            <span className="material-symbol" aria-hidden="true">
              verified_user
            </span>
            {mode === "register"
              ? "Register with Microsoft"
              : mode === "link"
                ? "Link Microsoft account"
                : "Sign in with Microsoft"}
          </button>
          {!checking && !enabled && (
            <p className="login-note">
              Microsoft verification is not available yet.
            </p>
          )}
        </>
      ) : (
        <>
          <h3>
            {mode === "link"
              ? "Link Microsoft account"
              : "Microsoft verification"}
          </h3>
          {ready ? (
            <>
              <MicrosoftConfirmation ready={ready} />
              {passwordStage ? (
                <form onSubmit={(e) => void finish(e)}>
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    Confirm password
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                  <button disabled={busy}>
                    {busy && <Spinner />}Complete registration
                  </button>
                </form>
              ) : (
                <button
                  disabled={busy}
                  onClick={() =>
                    mode === "register" ? setPasswordStage(true) : void finish()
                  }
                >
                  {busy && <Spinner />}
                  {mode === "register"
                    ? "Confirm username"
                    : mode === "link"
                      ? "Confirm and link account"
                      : "Confirm and sign in"}
                </button>
              )}
            </>
          ) : (
            <>
              <LoadingStatus>Waiting for Microsoft verification…</LoadingStatus>
              <a
                href={microsoftAuthorizationUrl(flow.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Microsoft sign-in
              </a>
            </>
          )}
          <button disabled={busy} onClick={() => void cancel()}>
            Cancel verification
          </button>
        </>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
