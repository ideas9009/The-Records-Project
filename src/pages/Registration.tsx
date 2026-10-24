import AuthWallpapers from "../components/AuthWallpapers";
import type { Account } from "../lib/cloud-auth";
import MyProfile from "./MyProfile";
import { apiRequest } from "../lib/api";
import { RegistrationFacts } from "../components/ManualRegistration";
import MinecraftFace from "../components/MinecraftFace";
import Administration from "./Administration";
import { Spinner } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { signOutCloud, firebaseError } from "../lib/cloud-auth";
export function RegistrationProfile({
  go,
}: { go?: (page: string) => void } = {}) {
  const { account } = useAuth();
  if (!account) return null;
  return account.status === "approved" ? (
    <MyProfile go={go} />
  ) : (
    <RegistrationStatus />
  );
}
export function RegistrationStatus({
  previewAccount,
}: { previewAccount?: Account } = {}) {
  const auth = useAuth();
  const account = previewAccount ?? auth.account;
  const retry = previewAccount ? () => {} : auth.retry;
  const [rechecking, setRechecking] = useState(false),
    [recheckError, setRecheckError] = useState("");
  const [logoutAnchor, setLogoutAnchor] = useState<HTMLElement | null>(null);
  const [loggingOut, setLoggingOut] = useState(false),
    [logoutError, setLogoutError] = useState("");
  async function logout() {
    if (previewAccount) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await signOutCloud();
    } catch (reason) {
      setLogoutError(firebaseError(reason));
      setLoggingOut(false);
    }
  }
  if (!account) return null;
  const pending = account.status === "pending";
  return (
    <div className="app login-screen login-stage auth-screen">
      <AuthWallpapers />
      <section className="card login-card login-entry login-register registration-status">
        <header className="login-heading">
          <div className="login-heading-row">
            <h1>
              {pending ? "Registration pending" : "Registration complete"}
            </h1>
            <img
              src="/trp-logo.png"
              alt="The Records Project"
              className="login-logo"
            />
          </div>
          <p>
            {pending
              ? "Your registration is being reviewed."
              : "Your registration is approved and full access is enabled."}
          </p>
        </header>
        <div className="registration-status-layout">
          <aside
            className="registration-status-rail"
            aria-label="Registration progress"
          >
            <ol className="manual-registration-steps">
              {[
                "Registration submitted",
                pending ? "Awaiting approval" : "Registration approved",
                pending ? "Full access pending" : "Full access enabled",
              ].map((label, index) => (
                <li
                  key={index}
                  aria-current={pending && index === 1 ? "step" : undefined}
                  data-complete={!pending || index === 0 ? "true" : undefined}
                >
                  <span className="registration-step-number" aria-hidden="true">
                    {!pending || index === 0 ? "✓" : index + 1}
                  </span>
                  <span>
                    {label}
                    <small>
                      {
                        [
                          "Profile and password saved",
                          "Identity and town review",
                          "Start using TRP",
                        ][index]
                      }
                    </small>
                  </span>
                </li>
              ))}
            </ol>
            <button
              className="registration-status-logout"
              disabled={!!previewAccount || loggingOut}
              onClick={(event) => {
                setLogoutError("");
                setLogoutAnchor(event.currentTarget);
              }}
            >
              <span className="material-symbol" aria-hidden="true">
                logout
              </span>
              Log out
            </button>
          </aside>
          <div className="registration-status-content">
            <h2>Your registration</h2>
            {account.registration ? (
              <RegistrationFacts profile={account.registration} />
            ) : (
              <div className="manual-registration-identity">
                <MinecraftFace
                  username={account.username}
                  className="manual-registration-face"
                />
                <h3>{account.username}</h3>
              </div>
            )}
            <section
              className="registration-review-message"
              aria-labelledby="registration-review-title"
            >
              <span className="material-symbol" aria-hidden="true">
                {pending ? "pending_actions" : "check_circle"}
              </span>
              <div>
                <h3 id="registration-review-title">
                  {pending ? "Awaiting approval" : "You’re ready to go"}
                </h3>
                <p role="status">
                  {pending
                    ? account.registrationWaiting ||
                      "Awaiting administrator identity review."
                    : "EMC identity reviewed and town membership linked."}
                </p>
                {pending && account.registration?.isMayor && (
                  <p>
                    Your town will be added only after a reviewer approves your
                    identity and mayoral status.
                  </p>
                )}
                {account.townRegistrationPending && (
                  <p>
                    {account.earthmcTownName || "Your town"} will be linked when
                    its verified mayor registers.
                  </p>
                )}
              </div>
            </section>
            {pending && (
              <p className="registration-status-help">
                You will gain access after your registration has been approved.
              </p>
            )}
            {pending && account.registrationMethod === "manual-emc" && (
              <button
                className="registration-status-recheck"
                disabled={rechecking || !!previewAccount}
                aria-busy={rechecking}
                onClick={() => {
                  if (previewAccount || rechecking) return;
                  setRechecking(true);
                  setRecheckError("");
                  void apiRequest("/api/auth/register/recheck", {
                    method: "POST",
                    body: {},
                  })
                    .then(() => retry())
                    .catch((e) => setRecheckError(firebaseError(e)))
                    .finally(() => setRechecking(false));
                }}
              >
                {rechecking && <Spinner />}
                <span className="material-symbol" aria-hidden="true">
                  refresh
                </span>
                {rechecking ? "Checking EMC…" : "Recheck EMC profile"}
              </button>
            )}
            {recheckError && (
              <p role="alert" className="login-error">
                {recheckError}
              </p>
            )}
          </div>
        </div>
      </section>
      <ExpandingConfirmation
        anchor={logoutAnchor}
        title="Log out?"
        message="You can sign in again with your Minecraft username and password."
        triggerLabel="Log out"
        triggerIcon="logout"
        confirmText="Log out"
        busy={loggingOut}
        error={logoutError}
        onCancel={() => setLogoutAnchor(null)}
        onConfirm={() => void logout()}
      />
    </div>
  );
}

export function RegistrationRequests() {
  return <Administration />;
}
