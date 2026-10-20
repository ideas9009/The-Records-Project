import { useState, type FormEvent } from "react";
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
export default function ManualRegistration() {
  const [username, setUsername] = useState(""),
    [confirmation, setConfirmation] = useState<ManualConfirmation | null>(null),
    [stage, setStage] = useState<"lookup" | "confirm" | "password">("lookup");
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
    <div className="manual-registration">
      <ol className="manual-registration-steps" aria-label="Registration steps">
        {["EMC username", "Confirm profile", "Set password"].map((label, i) => (
          <li
            key={label}
            aria-current={
              i === ["lookup", "confirm", "password"].indexOf(stage)
                ? "step"
                : undefined
            }
          >
            {label}
          </li>
        ))}
      </ol>
      {stage === "lookup" ? (
        <form onSubmit={(e) => void lookup(e)}>
          <label>
            Minecraft username
            <input
              autoComplete="username"
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
            <RegistrationFacts profile={confirmation.profile} />
            {stage === "confirm" ? (
              <>
                <p>Is this your Minecraft profile?</p>
                <p className="login-note">
                  A TRP reviewer will confirm account ownership before approving
                  your registration.
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
                    <strong>{confirmation.profile.town.mayorName}</strong> joins
                    and <strong>{confirmation.profile.town.name}</strong> is
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
                <p>Choose a password for The Records Project.</p>
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
            <button
              type="button"
              className="login-switch"
              disabled={busy}
              onClick={reset}
            >
              Look up a different username
            </button>
          </>
        )
      )}
      {error && (
        <p role="alert" className="login-error">
          {error}
        </p>
      )}
    </div>
  );
}
