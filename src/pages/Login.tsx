import AuthWallpapers from "../components/AuthWallpapers";
import { APP_RELEASE_LABEL } from "../lib/app-release";
import ManualRegistration, {
  type RegistrationPreview,
} from "../components/ManualRegistration";
import MicrosoftVerification from "../components/MicrosoftVerification";
import { Spinner } from "../components/Loading";
import { useState, type FormEvent } from "react";
import { signInCloud, firebaseError } from "../lib/cloud-auth";
import "./Login.css";
export default function Login({
  preview,
  initialMode,
}: {
  preview?: { registration?: RegistrationPreview; onSignIn: () => void };
  initialMode?: "login" | "register";
} = {}) {
  const [microsoftActive, setMicrosoftActive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "register">(
      initialMode ?? (preview?.registration ? "register" : "login"),
    ),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (preview) {
      preview.onSignIn();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signInCloud(username, password);
    } catch (reason) {
      setError(firebaseError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app login-screen login-stage auth-screen">
      <AuthWallpapers />
      <section
        className={
          "card login-card login-entry " +
          (mode === "login" ? "login-signin" : "login-register")
        }
      >
        <header className="login-heading">
          <div className="login-heading-row">
            <h1>{mode === "login" ? "Sign in" : "Create an account"}</h1>
            <img
              src="/trp-logo.png"
              alt="The Records Project"
              className="login-logo"
            />
          </div>
          <p>
            {mode === "login"
              ? "Welcome back. Use your Minecraft username to continue."
              : "Find your EarthMC profile, confirm your details, then choose a password."}
          </p>
        </header>
        {!microsoftActive && (
          <>
            {mode === "register" ? (
              <ManualRegistration
                preview={preview?.registration}
                initialUsername={username}
                onBusyChange={setRegistrationBusy}
              />
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <label>
                  Minecraft username
                  <input
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    maxLength={16}
                    spellCheck={false}
                  />
                </label>
                <label>
                  Password
                  <span className="login-password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      aria-label="Password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      maxLength={128}
                    />
                    <button
                      type="button"
                      className="login-password-toggle"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      <span className="material-symbol" aria-hidden="true">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </span>
                </label>
                {error && (
                  <p role="alert" className="login-error">
                    {error}
                  </p>
                )}
                <button
                  className="login-submit"
                  type="submit"
                  aria-busy={busy}
                  disabled={busy}
                >
                  {busy && <Spinner />}
                  {busy
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : "Submit registration"}
                </button>
              </form>
            )}
          </>
        )}
        <div
          className={
            "login-alternatives" + (microsoftActive ? " is-active" : "")
          }
        >
          {!microsoftActive && (
            <button
              type="button"
              className="login-switch"
              disabled={
                busy || registrationBusy || (!!preview && !preview.registration)
              }
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setPassword("");
                setShowPassword(false);
              }}
            >
              {mode === "login" ? "Create an account" : "Back to sign in"}
            </button>
          )}
          {preview ? (
            <button disabled className="microsoft-button">
              {mode === "login"
                ? "Continue with Microsoft"
                : "Register with Microsoft"}
            </button>
          ) : (
            <MicrosoftVerification
              mode={mode}
              buttonLabel={
                mode === "login" ? "Continue with Microsoft" : undefined
              }
              onActiveChange={setMicrosoftActive}
            />
          )}
        </div>
        {mode === "login" && (
          <p className="login-note login-version">{APP_RELEASE_LABEL}</p>
        )}
      </section>
    </div>
  );
}
