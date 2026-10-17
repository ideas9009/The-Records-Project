import { roleLabels } from "../lib/access";
import Administration from "./Administration";
import { Spinner } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { useState } from "react";
import { PREVIEW_MODE } from "../lib/runtime-mode";
import { useAuth } from "../lib/auth-context";
import { signOutCloud, firebaseError } from "../lib/cloud-auth";
export function RegistrationProfile() {
  const { account } = useAuth();
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
          <h1>My Profile</h1>
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
        <h1>My Profile</h1>
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
        <h2>{account.username}</h2>
        <p className="login-note">Account ID: {account.uid}</p>
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
          <p>You may get a confirmation notification on your discord</p>
        ) : (
          <p>Roles: {roleLabels(account)}</p>
        )}
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
    </>
  );
}
export function RegistrationRequests() {
  return <Administration />;
}
