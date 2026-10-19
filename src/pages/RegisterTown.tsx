import { townTypes } from "../lib/cloud-towns";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus, Spinner } from "../components/Loading";
import "./Administration.css";
export default function RegisterTown({
  onCreated,
  onCancel,
  existingCapital,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
  existingCapital?: string;
}) {
  const [users, setUsers] = useState<{ uid: string; username: string }[]>([]),
    [name, setName] = useState(""),
    [mayors, setMayors] = useState<string[]>([]),
    [type, setType] = useState("settlement"),
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
        body: { name, type, mayorUids: mayors },
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
        What type of town?
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={busy}
        >
          {Object.entries(townTypes).map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={value === "capital" && !!existingCapital}
            >
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="login-note">
        {existingCapital
          ? existingCapital + " is already the capital."
          : "Only one town can be the capital."}
      </p>
      <label>
        Mayors
        <select
          value=""
          onChange={(e) => {
            const uid = e.target.value;
            if (uid) setMayors((current) => current.includes(uid) ? current : [...current, uid]);
          }}
          disabled={loading || busy || mayors.length >= 20}
        >
          <option value="">Select a user to add</option>
          {users.map((user) => (
            <option
              key={user.uid}
              value={user.uid}
              disabled={mayors.includes(user.uid)}
            >
              {user.username}
            </option>
          ))}
        </select>
      </label>
      <p className="login-note">
        Select one or more mayors. Each mayor can manage multiple towns.
      </p>
      <ul className="town-residents">
        {mayors.map((uid) => (
          <li key={uid}>
            {users.find((user) => user.uid === uid)?.username}
            <button
              type="button"
              disabled={busy}
              aria-label={
                "Remove " +
                users.find((user) => user.uid === uid)?.username +
                " as mayor"
              }
              onClick={() =>
                setMayors((current) => current.filter((value) => value !== uid))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button disabled={busy || loading || !users.length || !mayors.length}>
          {busy && <Spinner />}Register Town
        </button>
      </div>
    </form>
  );
}
