import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import MicrosoftVerification from "./MicrosoftVerification";
import { Spinner } from "./Loading";
import "./account-settings.css";
export default function AccountSettings() {
  const { account } = useAuth();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    if (next !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/auth/password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent("");
      setNext("");
      setConfirmation("");
      setOpen(false);
      setMessage("Password updated. Other sessions have been signed out.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update your password.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!account) return null;
  return (
    <div className="account-settings">
      <section className="card setting-card">
        <div className="setting-row">
          <div>
            <h2>The Records Project password</h2>
          </div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
              setError("");
              setMessage("");
              setCurrent("");
              setNext("");
              setConfirmation("");
            }}
            disabled={busy}
          >
            Change password
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        {open && (
          <form
            className="account-password-form"
            onSubmit={(event) => void save(event)}
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={account.username}
              readOnly
              hidden
            />
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                maxLength={128}
                required
                disabled={busy}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
                onChange={(event) => setNext(event.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <small>8-128 characters. Other sessions will be signed out.</small>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="account-actions">
              <button type="submit" disabled={busy} aria-busy={busy}>
                {busy && <Spinner />}
                {busy ? "Updating..." : "Update password"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setCurrent("");
                  setNext("");
                  setConfirmation("");
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="card setting-card">
        <h2>Microsoft account</h2>
        {account.minecraftVerified ? (
          <p>Linked to your verified Minecraft account.</p>
        ) : (
          <MicrosoftVerification mode="link" />
        )}
      </section>
      <section className="card setting-card">
        <div className="setting-row">
          <h2>Discord account</h2>
          <span className="badge">Coming soon</span>
        </div>
        <button type="button" disabled>
          Link Discord account
        </button>
      </section>
    </div>
  );
}

