import { RegistrationFacts } from "../components/ManualRegistration";
import RankReviews from "./RankReviews";
import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  accountRoles,
  canManageRoles,
  hasRole,
  roleNames,
  roleLabels,
  type Role,
} from "../lib/access";
import type { Account } from "../lib/cloud-auth";
import { LoadingStatus, Spinner } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import "./Administration.css";
type Audit = {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
};
export default function Administration() {
  const { account } = useAuth(),
    [tab, setTab] = useState("registrations"),
    [users, setUsers] = useState<Account[]>([]),
    [logs, setLogs] = useState<Audit[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<Account | null>(null),
    [roles, setRoles] = useState<Role[]>([]),
    [confirmation, setConfirmation] = useState<{
      anchor: HTMLElement;
      user: Account;
      body: object;
      label: string;
    } | null>(null);
  useEffect(() => {
    if (tab === "ranks") return;
    setLoading(true);
    setError("");
    return watchResource<Account[] | Audit[]>(
      tab === "activity" ? "/api/admin/activity" : "/api/admin/users",
      (items) => {
        if (tab === "activity") setLogs(items as Audit[]);
        else setUsers(items as Account[]);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setUsers([]);
        setLogs([]);
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [tab, revision]);
  const ask = (
    anchor: HTMLElement,
    user: Account,
    body: object,
    label: string,
  ) => {
    setError("");
    setConfirmation({ anchor, user, body, label });
  };
  async function save() {
    if (!confirmation) return;
    setBusy(true);
    try {
      await apiRequest("/api/admin/users/" + confirmation.user.uid, {
        method: "PUT",
        body: confirmation.body,
      });
      setConfirmation(null);
      setEditing(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }
  if (!account) return null;
  const filtered = users.filter(
    (user) =>
      (tab !== "registrations" || user.status === "pending") &&
      user.username.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="administration">
      <header className="page-header">
        <h1>Administration</h1>
      </header>
      <nav className="admin-tabs" aria-label="Administration sections">
        {[
          ["registrations", "Registrations"],
          ["users", "People & Permissions"],
          ["activity", "Activity Log"],
          ["ranks", "Rank Review"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setEditing(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && !confirmation && <p role="alert">{error}</p>}
      {tab !== "activity" && tab !== "ranks" && (
        <input
          className="admin-search"
          aria-label="Search users"
          placeholder="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {loading && tab !== "ranks" && (
        <LoadingStatus>Loading administration…</LoadingStatus>
      )}
      {tab === "ranks" ? (
        <RankReviews />
      ) : tab === "activity" ? (
        <section className="card">
          <h2>Activity Log</h2>
          {logs.map((log) => (
            <div className="admin-row" key={log.id}>
              <div>
                <strong>{log.actor}</strong>
                <p>
                  {log.action} · {log.target}
                </p>
              </div>
              <time>{new Date(log.createdAt).toLocaleString()}</time>
            </div>
          ))}
          {!loading && !logs.length && <p>No recorded activity.</p>}
        </section>
      ) : (
        <section className="card">
          {!loading && !filtered.length && (
            <p>
              {tab === "registrations"
                ? "No pending registrations."
                : "No users found."}
            </p>
          )}
          {filtered.map((user) => (
            <div className="admin-row" key={user.uid}>
              <div>
                <strong>{user.username}</strong>
                <p>
                  {roleLabels(user)} · {user.status}
                </p>
                {user.registrationMethod === "manual-emc" &&
                  user.registration && (
                    <details className="manual-review-profile">
                      <summary>
                        EMC profile ·{" "}
                        {user.registration.isMayor ? "Mayor" : "Citizen"} ·{" "}
                        {user.registration.town.name}
                      </summary>
                      <RegistrationFacts profile={user.registration} />
                      {user.status === "pending" && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            setError("");
                            void apiRequest("/api/auth/register/recheck", {
                              method: "POST",
                              body: { uid: user.uid },
                            })
                              .then(() => setRevision((n) => n + 1))
                              .catch((e) =>
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "EMC could not be rechecked.",
                                ),
                              )
                              .finally(() => setBusy(false));
                          }}
                        >
                          Recheck EMC
                        </button>
                      )}

                      <p>{user.registrationWaiting}</p>
                      <p>
                        Manual lookup does not prove ownership. Verify the
                        player before approving.
                      </p>
                    </details>
                  )}
              </div>
              <div className="admin-actions">
                {tab === "registrations" ? (
                  <>
                    <button
                      disabled={user.registrationReady === false}
                      title={
                        user.registrationReady === false
                          ? user.registrationWaiting
                          : undefined
                      }
                      onClick={(e) =>
                        ask(
                          e.currentTarget,
                          user,
                          { status: "approved" },
                          "Approve registration",
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      onClick={(e) =>
                        ask(
                          e.currentTarget,
                          user,
                          { status: "rejected" },
                          "Reject registration",
                        )
                      }
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <>
                    {canManageRoles(account) &&
                      (!accountRoles(user).includes("operator") ||
                        hasRole(account, ["operator"])) && (
                        <button
                          onClick={() => {
                            setEditing(user);
                            setRoles(accountRoles(user));
                          }}
                        >
                          Edit roles
                        </button>
                      )}
                    {user.uid !== account.uid &&
                      (hasRole(account, ["operator"]) ||
                        (!accountRoles(user).includes("operator") &&
                          (canManageRoles(account) ||
                            accountRoles(user).every((role) =>
                              ["citizen", "army"].includes(role),
                            )))) && (
                        <button
                          onClick={(e) =>
                            ask(
                              e.currentTarget,
                              user,
                              {
                                status:
                                  user.status === "suspended" ||
                                  user.status === "rejected"
                                    ? "approved"
                                    : "suspended",
                              },
                              user.status === "suspended" ||
                                user.status === "rejected"
                                ? "Restore access"
                                : "Suspend account",
                            )
                          }
                        >
                          {user.status === "suspended" ||
                          user.status === "rejected"
                            ? "Restore"
                            : "Suspend"}
                        </button>
                      )}
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {editing && (
        <section className="card admin-role-editor">
          <h2>Roles · {editing.username}</h2>
          <div className="admin-role-options">
            {Object.entries(roleNames)
              .filter(
                ([role]) =>
                  role !== "operator" || hasRole(account, ["operator"]),
              )
              .map(([role, label]) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role as Role)}
                    onChange={(e) =>
                      setRoles((old) =>
                        e.target.checked
                          ? [...old, role as Role]
                          : old.filter((item) => item !== role),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
          </div>
          <div className="admin-actions">
            <button onClick={() => setEditing(null)}>Cancel</button>
            <button
              disabled={!roles.length || busy}
              onClick={(e) =>
                ask(e.currentTarget, editing, { roles }, "Save roles")
              }
            >
              Save roles
            </button>
          </div>
        </section>
      )}
      <ExpandingConfirmation
        anchor={confirmation?.anchor || null}
        title={confirmation?.label + "?"}
        message={
          confirmation?.body &&
          "status" in confirmation.body &&
          confirmation.body.status === "approved" &&
          confirmation.user.registrationMethod === "manual-emc"
            ? "Confirm you have verified " +
              confirmation.user.username +
              "'s identity. Approval will " +
              (confirmation.user.registration?.isMayor
                ? "register or link their current EMC town and assign Mayor access."
                : "add them to their current EMC town.")
            : "Apply this change to " + confirmation?.user.username + "?"
        }
        triggerLabel={confirmation?.label || "Confirm"}
        confirmText={confirmation?.label || "Confirm"}
        busy={busy}
        error={error}
        onCancel={() => {
          setConfirmation(null);
          setError("");
        }}
        onConfirm={() => void save()}
      />
      {busy && <Spinner />}
    </div>
  );
}
