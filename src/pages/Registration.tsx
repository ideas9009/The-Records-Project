import MyProfile from "./MyProfile";
import { apiRequest } from "../lib/api";
import { RegistrationFacts } from "../components/ManualRegistration";
import MinecraftFace from "../components/MinecraftFace";
import MicrosoftVerification from "../components/MicrosoftVerification";
import { roleLabels } from "../lib/access";
import Administration from "./Administration";
import { Spinner } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { useState } from "react";
import { PREVIEW_MODE } from "../lib/runtime-mode";
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
function RegistrationStatus() {
  const { account, retry } = useAuth();
  const [rechecking, setRechecking] = useState(false),
    [recheckError, setRecheckError] = useState("");
  const [logoutAnchor, setLogoutAnchor] = useState<HTMLElement | null>(null);
  const [loggingOut, setLoggingOut] = useState(false),
    [logoutError, setLogoutError] = useState("");
  async function logout() {
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
  if (PREVIEW_MODE)
    return (
      <>
        <header className="page-header">
          <div>
            <h1>
              {account.status === "pending"
                ? "Registration pending"
                : "My Profile"}
            </h1>
            <p>
              {account.status === "pending"
                ? "Your registration is being reviewed."
                : "Coming soon in future phases"}
            </p>
          </div>
        </header>
        <section className="card">
          <h2>Sumeitideas</h2>
          <p>Preview mode</p>
        </section>
      </>
    );
  return (
    <>
      <header className="page-header">
        <div>
          <h1>
            {account.status === "pending"
              ? "Registration pending"
              : "My Profile"}
          </h1>
          <p>
            {account.status === "pending"
              ? "Your registration is being reviewed."
              : "Coming soon in future phases"}
          </p>
        </div>
        <button
          onClick={(event) => {
            setLogoutError("");
            setLogoutAnchor(event.currentTarget);
          }}
        >
          Log out
        </button>
      </header>
      <section className="card">
        <div className="minecraft-identity">
          <MinecraftFace
            username={account.username}
            className="profile-face"
            variant="body"
            eager
          />
          <h2>{account.username}</h2>
        </div>
        <p className="login-note">Account ID: {account.uid}</p>
        {account.townRegistrationPending && (
          <p className="microsoft-warning">
            <strong>Your town is awaiting registration</strong>
            {account.earthmcTownName} will be linked when its verified mayor
            registers.
          </p>
        )}
        {account.registrationMethod === "manual-emc" &&
          account.registration && (
            <>
              <RegistrationFacts profile={account.registration} />
              {account.status === "pending" && (
                <>
                  <button
                    disabled={rechecking}
                    onClick={() => {
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
                    {rechecking ? "Checking EMC…" : "Recheck EMC profile"}
                  </button>
                  {recheckError && <p role="alert">{recheckError}</p>}
                </>
              )}

              <p className="manual-registration-notice" role="status">
                {account.status === "pending"
                  ? account.registrationWaiting ||
                    "Awaiting administrator identity review."
                  : "EMC identity reviewed and town membership linked."}
              </p>
              {account.registration.isMayor && account.status === "pending" && (
                <p>
                  Your town will be added only after a reviewer approves your
                  identity and mayoral status.
                </p>
              )}
            </>
          )}
        <h3>Access status</h3>
        <ol className="registration-progress">
          <li>Registration submitted</li>
          <li aria-current={account.status === "pending" ? "step" : undefined}>
            {account.status === "pending"
              ? "Awaiting approval"
              : "Registration approved"}
          </li>
          <li>
            {account.status === "approved"
              ? "Full access enabled"
              : "Full access pending"}
          </li>
        </ol>
        {account.status === "pending" ? (
          <p>You will gain access after your registration has been approved.</p>
        ) : (
          <p>Roles: {roleLabels(account)}</p>
        )}
      </section>
      {account.status !== "pending" &&
        (account.minecraftVerified ? (
          <section className="card">
            <h2>Microsoft account</h2>
            <p>Linked to your verified Minecraft account.</p>
          </section>
        ) : (
          <section className="card">
            <MicrosoftVerification mode="link" />
          </section>
        ))}
      {account.status !== "pending" && (
        <section className="card">
          <h2>Coming soon in future phases</h2>
          <p>
            The full My Profile experience and profile customization are planned
            for future updates.
          </p>
        </section>
      )}
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
    </>
  );
}
export function RegistrationRequests() {
  return <Administration />;
}
