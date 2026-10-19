import ExpandingConfirmation from "../components/ExpandingConfirmation";
import type { Town } from "../lib/cloud-towns";
import { townTypes } from "../lib/cloud-towns";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus, Spinner } from "../components/Loading";
import "./Administration.css";
export default function RegisterTown({
  onCreated,
  onCancel,
  existingCapital,
  town,
  canManageMayors = true,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
  existingCapital?: string;
  town?: Town;
  canManageMayors?: boolean;
}) {
  const [users, setUsers] = useState<{ uid: string; username: string }[]>([]),
    [name, setName] = useState(town?.name || ""),
    [mayors, setMayors] = useState<string[]>(
      town?.mayorUids || (town?.mayorUid ? [town.mayorUid] : []),
    ),
    [type, setType] = useState(town?.type || "settlement"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const [confirmation, setConfirmation] = useState<HTMLElement | null>(null);
  const pending = useRef<() => void>(() => {});
  const dirty =
    !!town &&
    (name !== town.name ||
      type !== (town.type || "settlement") ||
      JSON.stringify(mayors) !==
        JSON.stringify(town.mayorUids || [town.mayorUid]));
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };
  const leave = (anchor: HTMLElement, proceed: () => void) => {
    if (busy) return;
    if (!dirty) {
      proceed();
      return;
    }
    pending.current = proceed;
    setConfirmation(anchor);
  };
  useEffect(() => {
    const guard = (event: Event) => {
      if (!current.current.dirty && !current.current.busy) return;
      event.preventDefault();
      if (current.current.busy) return;
      const nav = event as CustomEvent<{
        proceed: () => void;
        anchor: HTMLElement;
      }>;
      pending.current = nav.detail.proceed;
      setConfirmation(nav.detail.anchor || form.current);
    };
    window.addEventListener("records-navigate", guard);
    return () => window.removeEventListener("records-navigate", guard);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!canManageMayors) {
      setLoading(false);
      return;
    }
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
      const result = await apiRequest<{ id: string }>(
        town ? "/api/towns/" + town.id : "/api/towns",
        {
          method: town ? "PUT" : "POST",
          body: {
            name,
            type,
            ...(canManageMayors ? { mayorUids: mayors } : {}),
            ...(town ? { version: town.version || 0 } : {}),
          },
        },
      );
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register town.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={form}
      className="card register-town-form"
      onSubmit={(e) => void submit(e)}
    >
      <h2>{town ? "Edit Town" : "Register Town"}</h2>
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
      {canManageMayors ? (
        <>
          <label>
            Mayors
            <select
              value=""
              onChange={(e) => {
                const uid = e.target.value;
                if (uid)
                  setMayors((current) =>
                    current.includes(uid) ? current : [...current, uid],
                  );
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
                    setMayors((current) =>
                      current.filter((value) => value !== uid),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          Mayors: {town?.mayorNames?.join(", ") || town?.mayor}. Mayor
          assignments are managed by authorized administrators.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <button
          type="button"
          disabled={busy}
          onClick={(event) => leave(event.currentTarget, onCancel)}
        >
          Cancel
        </button>
        <button
          disabled={
            busy ||
            loading ||
            (canManageMayors && (!users.length || !mayors.length))
          }
        >
          {busy && <Spinner />}
          {town ? "Save changes" : "Register Town"}
        </button>
      </div>
      <ExpandingConfirmation
        anchor={confirmation}
        title="Discard unsaved changes?"
        message="Your town changes have not been saved."
        triggerLabel="Back"
        triggerIcon="arrow_back"
        confirmText="Discard changes"
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          setConfirmation(null);
          pending.current();
        }}
      />
    </form>
  );
}
