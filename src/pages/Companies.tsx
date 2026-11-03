import { useState } from "react";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Spinner } from "../components/Loading";
export default function Companies() {
  const { account } = useAuth();
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  async function register() {
    if (busy || sent) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/companies/registration-interest", {
        method: "POST",
        body: {},
      });
      setSent(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your request could not be sent. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <header className="page-header page-banner">
        <h1>Companies</h1>
        <button
          disabled={busy || sent || account?.status !== "approved"}
          onClick={() => void register()}
        >
          {busy ? (
            <Spinner />
          ) : (
            <span className="material-symbol" aria-hidden="true">
              {sent ? "check" : "add_business"}
            </span>
          )}
          {sent ? "Request sent" : "Register your company"}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {sent && (
        <p className="card" role="status">
          Your request has been sent to Sumeitideas.
        </p>
      )}
      <section className="card rebuild-placeholder companies-tour-info">
        <div className="empty">
          <span className="material-symbol" aria-hidden="true">
            cases
          </span>
          <h2>Coming soon in future updates</h2>
          <p>
            Company profiles are on the way. Select “Register your company” to
            let Sumeitideas know you’re interested.
          </p>
          {account?.status !== "approved" && (
            <p>
              Your TRP registration must be approved before you can send a
              request.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
