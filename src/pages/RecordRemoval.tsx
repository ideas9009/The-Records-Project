import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { canRemoveRecords, hasRole } from "../lib/access";
import { LoadingStatus } from "../components/Loading";
type Row = {
  id?: string;
  uid?: string;
  name?: string;
  username?: string;
  mayor?: string;
  status?: string;
  roles?: string[];
};
export default function RecordRemoval({ kind }: { kind: "towns" | "players" }) {
  const { account } = useAuth();
  const [rows, setRows] = useState<Row[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [confirmName, setConfirmName] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const permitted = canRemoveRecords(account),
    title = kind === "towns" ? "Remove Towns" : "Remove Players";
  useEffect(() => {
    setRows([]);
    setSelected(null);
    setConfirmName("");
    setError("");
    setLoading(true);
    if (!permitted) return;
    return watchResource<Row[]>(
      "/api/admin/removal/" + kind,
      (items) => {
        setRows(items);
        setLoading(false);
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [kind, permitted, revision]);
  if (!permitted) return <p>You do not have permission to remove records.</p>;
  const name = (row: Row) => row.name || row.username || "";
  async function remove() {
    if (!selected || confirmName !== name(selected) || busy) return;
    setBusy(true);
    setError("");
    try {
      const removed = name(selected);
      await apiRequest(
        "/api/admin/removal/" + kind + "/" + (selected.id || selected.uid),
        { method: "POST", body: { confirmName } },
      );
      setSelected(null);
      setConfirmName("");
      setRevision((n) => n + 1);
      setMessage(removed + " was removed.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not remove this record.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card record-removal">
      <h2>{title}</h2>
      <p>
        {kind === "towns"
          ? "Remove a town from TRP, including its registry entry, gallery and resident links. Player accounts stay registered."
          : "Remove a player's TRP account and sign-in access, and unlink them from their towns. Existing posts and chat history remain."}{" "}
        EarthMC records are unaffected.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {selected ? (
        <form
          className="removal-confirmation"
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <h3>Remove {name(selected)}?</h3>
          <p>
            This permanently removes the {kind === "towns" ? "town" : "player"}{" "}
            from TRP. This cannot be undone in the app.
          </p>
          <label>
            Type <strong>{name(selected)}</strong> to confirm
            <input
              autoFocus
              autoComplete="off"
              value={confirmName}
              disabled={busy}
              onChange={(e) => setConfirmName(e.target.value)}
              aria-label="Confirm removal name"
            />
          </label>
          <div className="admin-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setError("");
              }}
            >
              Cancel
            </button>
            <button
              className="remove-record-button"
              type="submit"
              disabled={busy || confirmName !== name(selected)}
            >
              {busy ? "Removing…" : "Permanently remove"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <input
            className="admin-search"
            aria-label={"Search " + kind}
            placeholder={"Search " + kind}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <LoadingStatus>Loading {kind}…</LoadingStatus>
          ) : (
            <>
              {rows
                .filter((row) =>
                  name(row).toLowerCase().includes(query.toLowerCase()),
                )
                .map((row) => {
                  const self = row.uid === account?.uid;
                  const protectedOperator =
                    row.roles?.includes("operator") &&
                    !hasRole(account, ["operator"]);
                  return (
                    <div className="admin-row" key={row.id || row.uid}>
                      <div>
                        <strong>{name(row)}</strong>
                        <p>{row.mayor ? "Mayor: " + row.mayor : row.status}</p>
                      </div>
                      <button
                        className="remove-record-button"
                        disabled={self || protectedOperator}
                        title={
                          self
                            ? "You cannot remove your own account."
                            : protectedOperator
                              ? "Only an Operator can remove an Operator."
                              : undefined
                        }
                        onClick={() => {
                          setSelected(row);
                          setConfirmName("");
                          setError("");
                          setMessage("");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              {!rows.some((row) =>
                name(row).toLowerCase().includes(query.toLowerCase()),
              ) && <p>No {kind} found.</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}
