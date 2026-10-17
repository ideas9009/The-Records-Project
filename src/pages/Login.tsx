import { Spinner } from "../components/Loading";
import { useState, type FormEvent } from "react";
import { registerCloud, signInCloud, firebaseError } from "../lib/cloud-auth";
import { useAuth } from "../lib/auth-context";
import "./Login.css";
export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await (mode === "login"
        ? signInCloud(username, password)
        : registerCloud(username, password, confirmation));
    } catch (reason) {
      setError(firebaseError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app login-screen">
      <section className="card login-card">
        <img src="/trp-logo.png" alt="" className="login-logo" />
        <h1>The Records Project</h1>
        <h2>{mode === "login" ? "Sign in" : "Register"}</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Minecraft Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={16}
              spellCheck={false}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
            />
          </label>
          {mode === "register" && (
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                maxLength={128}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="login-error">
              {error}
            </p>
          )}
          <button type="submit" aria-busy={busy} disabled={busy}>
            {busy && <Spinner />}
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Submit registration"}
          </button>
        </form>
        <button
          className="login-switch"
          disabled={busy}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setPassword("");
            setConfirmation("");
          }}
        >
          {mode === "login" ? "Create an account" : "Back to sign in"}
        </button>
        {mode === "register" && (
          <p className="login-note">
            You may get a confirmation notification on your discord
          </p>
        )}
        <p className="login-note">Nostra · 2 | Beta 1</p>
      </section>
    </div>
  );
}
