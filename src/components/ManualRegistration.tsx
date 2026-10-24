import { useEffect, useRef, useState, type FormEvent } from "react";
import MinecraftFace from "./MinecraftFace";
import { Spinner } from "./Loading";
import {
  lookupRegistration,
  submitManualRegistration,
  type ManualProfile,
  type ManualConfirmation,
} from "../lib/manual-registration";
const gold = (n: number | null) =>
  n === null ? "Unavailable" : n.toLocaleString() + " Gold";
export function RegistrationFacts({ profile: p }: { profile: ManualProfile }) {
  return (
    <div className="manual-registration-facts">
      <div className="manual-registration-identity">
        <MinecraftFace
          username={p.username}
          className="manual-registration-face"
        />
        <h3>{p.username}</h3>
      </div>
      <dl>
        <div>
          <dt>Bank balance</dt>
          <dd>{gold(p.balance)}</dd>
        </div>
        {p.isMayor && (
          <div>
            <dt>Town bank balance</dt>
            <dd>{gold(p.townBalance)}</dd>
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
          <dt>EMC roles</dt>
          <dd>
            {[
              ...new Set([
                ...(p.isMayor ? ["Mayor"] : ["Citizen"]),
                ...p.ranks,
              ]),
            ].join(" · ")}
          </dd>
        </div>
        <div>
          <dt>EMC mayor</dt>
          <dd>{p.town.mayorName || "Unavailable"}</dd>
        </div>
      </dl>
    </div>
  );
}
export type RegistrationPreview = {
  stage: "lookup" | "confirm" | "password";
  profile: ManualProfile;
  onComplete: () => void;
};
export default function ManualRegistration({
  preview,
  initialUsername = "",
  onBusyChange,
}: {
  preview?: RegistrationPreview;
  initialUsername?: string;
  onBusyChange?: (busy: boolean) => void;
} = {}) {
  const [username, setUsername] = useState(initialUsername),
    [confirmation, setConfirmation] = useState<ManualConfirmation | null>(
      preview
        ? { receipt: "preview-only", expiresAt: 0, profile: preview.profile }
        : null,
    ),
    [stage, setStage] = useState<"lookup" | "confirm" | "password">(
      preview?.stage ?? "lookup",
    );
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLElement>("input, [data-step-heading]")
      ?.focus();
  }, [stage]);
  const step = ["lookup", "confirm", "password"].indexOf(stage);
  const reset = () => {
    setStage("lookup");
    setConfirmation(null);
    setPassword("");
    setRepeat("");
    setError("");
  };
  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (preview) {
      setConfirmation({
        receipt: "preview-only",
        expiresAt: 0,
        profile: { ...preview.profile, username: username.trim() },
      });
      setStage("confirm");
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setConfirmation(await lookupRegistration(username.trim()));
      setStage("confirm");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "EMC could not be checked. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !confirmation) return;
    if (password !== repeat) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password between 8 and 128 characters.");
      return;
    }
    if (preview) {
      preview.onComplete();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitManualRegistration(confirmation, password);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Registration could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="manual-registration" data-stage={stage}>
      <ol className="manual-registration-steps" aria-label="Registration steps">
        {["EMC username", "Confirm profile", "Set password"].map((label, i) => (
          <li
            key={label}
            aria-current={
              i === ["lookup", "confirm", "password"].indexOf(stage)
                ? "step"
                : undefined
            }
            data-complete={i < step ? "true" : undefined}
          >
            <span className="registration-step-number" aria-hidden="true">
              {i < step ? "✓" : i + 1}
            </span>
            <span>
              {label}
              <small>
                {
                  [
                    "Find your player",
                    "Check your details",
                    "Secure your account",
                  ][i]
                }
              </small>
            </span>
          </li>
        ))}
      </ol>
      <section
        className="manual-registration-panel"
        ref={panel}
        key={stage}
        aria-labelledby="registration-step-title"
      >
        <p className="registration-step-count">Step {step + 1} of 3</p>
        <h2 id="registration-step-title" data-step-heading tabIndex={-1}>
          {
            [
              "Find your EMC profile",
              "Is this your profile?",
              "Choose your password",
            ][step]
          }
        </h2>
        {stage === "lookup" ? (
          <form onSubmit={(e) => void lookup(e)}>
            <label>
              Minecraft username
              <input
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={16}
                pattern="[A-Za-z0-9_]{3,16}"
                spellCheck={false}
              />
            </label>
            <p className="login-note">
              Find your public EMC profile before creating your TRP account.
            </p>
            <button disabled={busy} type="submit" aria-busy={busy}>
              {busy && <Spinner />}
              {busy ? "Checking EMC…" : "Find my EMC profile"}
            </button>
          </form>
        ) : (
          confirmation && (
            <>
              {stage === "confirm" ? (
                <RegistrationFacts profile={confirmation.profile} />
              ) : (
                <p className="registration-account-summary">
                  Creating an account for{" "}
                  <strong>{confirmation.profile.username}</strong> ·{" "}
                  {confirmation.profile.town.name}
                </p>
              )}
              {stage === "confirm" ? (
                <>
                  <p className="login-note">
                    A TRP reviewer will confirm account ownership before
                    approving your registration.
                  </p>
                  {confirmation.profile.isMayor ? (
                    <p className="manual-registration-notice">
                      After your identity is approved, TRP will register{" "}
                      <strong>{confirmation.profile.town.name}</strong> and link
                      you as its mayor. No town is added at this step.
                    </p>
                  ) : !confirmation.profile.townRegistered ||
                    !confirmation.profile.mayorRegistered ? (
                    <p className="manual-registration-notice">
                      Your registration will wait until{" "}
                      <strong>{confirmation.profile.town.mayorName}</strong>{" "}
                      joins and{" "}
                      <strong>{confirmation.profile.town.name}</strong> is
                      approved. You cannot be accepted before then.
                    </p>
                  ) : (
                    <p className="manual-registration-notice">
                      Once approved, you will be added to{" "}
                      <strong>{confirmation.profile.town.name}</strong>{" "}
                      automatically.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setStage("password");
                      setError("");
                    }}
                  >
                    This is my profile — Continue
                  </button>
                </>
              ) : (
                <form onSubmit={(e) => void submit(e)}>
                  <p className="login-note">
                    Use 8–128 characters. Your TRP password is separate from
                    your Minecraft password.
                  </p>
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      maxLength={128}
                    />
                  </label>
                  <label>
                    Confirm password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                      required
                      minLength={8}
                      maxLength={128}
                    />
                  </label>
                  <button type="submit" disabled={busy} aria-busy={busy}>
                    {busy && <Spinner />}
                    {busy ? "Submitting registration…" : "Submit for review"}
                  </button>
                </form>
              )}
            </>
          )
        )}
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
      </section>
      {stage !== "lookup" && (
        <button
          type="button"
          className="registration-step-back"
          disabled={busy}
          aria-label={
            stage === "password" ? "Back to profile" : "Back to EMC username"
          }
          title={
            stage === "password" ? "Back to profile" : "Back to EMC username"
          }
          onClick={() => {
            if (stage === "password") {
              setStage("confirm");
              setPassword("");
              setRepeat("");
              setError("");
            } else reset();
          }}
        >
          <span className="material-symbol" aria-hidden="true">
            arrow_back
          </span>
        </button>
      )}
    </div>
  );
}
