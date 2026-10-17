import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus, Spinner } from "../components/Loading";
import "./Administration.css";
export default function RegisterTown({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [users, setUsers] = useState<{ uid: string; username: string }[]>([]),
    [name, setName] = useState(""),
    [mayor, setMayor] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<typeof users>("/api/towns/mayor-options")
      .then((items) => {
        if (active) setUsers(items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ id: string }>("/api/towns", {
        method: "POST",
        body: { name, mayorUid: mayor },
      });
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register town.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card register-town-form" onSubmit={(e) => void submit(e)}>
      <h2>Register Town</h2>
      {loading && <LoadingStatus>Loading users…</LoadingStatus>}
      <label>
        Town Name
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        Mayor
        <select
          required
          value={mayor}
          onChange={(e) => setMayor(e.target.value)}
          disabled={loading || busy}
        >
          <option value="">Select a user</option>
          {users.map((user) => (
            <option key={user.uid} value={user.uid}>
              {user.username}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button disabled={busy || loading || !users.length}>
          {busy && <Spinner />}Register Town
        </button>
      </div>
    </form>
  );
}
