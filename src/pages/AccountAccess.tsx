import MinecraftFace from "../components/MinecraftFace";
import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { canControlAccount, roleLabels } from "../lib/access";
import type { Account } from "../lib/cloud-auth";
import { LoadingStatus } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
export default function AccountAccess() {
  const { account } = useAuth();
  const [users, setUsers] = useState<Account[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<{
    user: Account;
    anchor: HTMLElement;
  } | null>(null);
  useEffect(
    () =>
      watchResource<Account[]>(
        "/api/admin/users",
        (items) => {
          setUsers(items);
          setLoading(false);
          setError("");
        },
        (reason) => {
          setError(reason.message);
          setLoading(false);
        },
      ),
    [revision],
  );
  async function save() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        "/api/admin/account-access/" + encodeURIComponent(confirm.user.uid),
        {
          method: "POST",
          body: {
            enabled: confirm.user.status === "disabled",
            expectedStatus: confirm.user.status,
          },
        },
      );
      setConfirm(null);
      setRevision((n) => n + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not change account access.",
      );
    } finally {
      setBusy(false);
    }
  }
  const filtered = users.filter(
    (user) =>
      user.username.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "all" ||
        (filter === "disabled") === (user.status === "disabled")),
  );
  return (
    <section className="card">
      <h2>Account access</h2>
      <p>
        Block sign-in while keeping account records. You can enable an account
        again here to restore its previous status.
      </p>
      <div className="citizens-toolbar">
        <input
          type="search"
          className="admin-search"
          placeholder="Search accounts"
          aria-label="Search account access"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter account access"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All accounts</option>
          <option value="disabled">Disabled accounts</option>
          <option value="enabled">Accounts not disabled</option>
        </select>
      </div>
      {loading && <LoadingStatus>Loading accounts...</LoadingStatus>}
      {error && !confirm && <p role="alert">{error}</p>}
      {filtered.map((user) => (
        <div className="admin-row" key={user.uid}>
          <div className="admin-person">
            <div className="admin-person-summary">
              <MinecraftFace username={user.username} />
              <div>
                <strong>{user.username}</strong>
                <span className="admin-status" data-status={user.status}>
                  {user.status}
                </span>
              </div>
            </div>
            <p>{roleLabels(user)}</p>
          </div>
          {canControlAccount(account, user) && (
            <button
              disabled={busy}
              onClick={(e) => {
                setError("");
                setConfirm({ user, anchor: e.currentTarget });
              }}
            >
              {user.status === "disabled"
                ? "Enable account"
                : "Disable account"}
            </button>
          )}
        </div>
      ))}
      {!loading && !filtered.length && <p>No matching accounts.</p>}
      <ExpandingConfirmation
        anchor={confirm?.anchor || null}
        title={
          confirm?.user.status === "disabled"
            ? "Enable account?"
            : "Disable account?"
        }
        message={
          confirm?.user.status === "disabled"
            ? "Restore " +
              confirm.user.username +
              "’s previous account status? They will need to sign in again."
            : "Disable " +
              confirm?.user.username +
              "? Sign-in and Microsoft registration will be blocked, and existing sessions will be revoked. Their records will be retained."
        }
        triggerLabel={
          confirm?.user.status === "disabled"
            ? "Enable account"
            : "Disable account"
        }
        confirmText={
          confirm?.user.status === "disabled"
            ? "Enable account"
            : "Disable account"
        }
        busy={busy}
        error={error}
        onCancel={() => {
          setConfirm(null);
          setError("");
        }}
        onConfirm={() => void save()}
      />
    </section>
  );
}
