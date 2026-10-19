import { prepareTownPhoto } from "../lib/town-gallery";
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
  const [users, setUsers] = useState<{ uid: string; username: string }[]>((town?.mayorUids || (town?.mayorUid ? [town.mayorUid] : [])).map((uid,index) => ({uid,username:town?.mayorNames?.[index] || town?.mayor || uid}))),
    [name, setName] = useState(town?.name || ""),
    [mayors, setMayors] = useState<string[]>(
      town?.mayorUids || (town?.mayorUid ? [town.mayorUid] : []),
    ),
    [type, setType] = useState(town?.type || "settlement"),
    [image, setImage] = useState(town?.image || ""),
    [residentNames, setResidentNames] = useState<string[]>(
      town?.registeredResidents || [],
    ),
    [processing, setProcessing] = useState(false),
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
      image !== town.image ||
      JSON.stringify(residentNames) !==
        JSON.stringify(town.registeredResidents) ||
      JSON.stringify(mayors) !==
        JSON.stringify(town.mayorUids || [town.mayorUid]));
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy: busy || processing };
  const leave = (anchor: HTMLElement, proceed: () => void) => {
    if (busy || processing) return;
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
    let active = true;
    apiRequest<typeof users>(
      canManageMayors ? "/api/towns/mayor-options" : "/api/citizens",
    )
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
      const residentUids =
        town &&
        JSON.stringify(residentNames) !==
          JSON.stringify(town.registeredResidents)
          ? residentNames.map((name) => {
              const user = users.find(
                (user) => user.username.toLowerCase() === name.toLowerCase(),
              );
              if (!user)
                throw Error(
                  "Remove unavailable resident " +
                    name +
                    " before saving the changed resident list.",
                );
              return user.uid;
            })
          : undefined;
      const result = await apiRequest<{ id: string }>(
        town ? "/api/towns/" + town.id : "/api/towns",
        {
          method: town ? "PUT" : "POST",
          body: {
            name,
            type,
            ...(canManageMayors ? { mayorUids: mayors } : {}),
            ...(town
              ? {
                  version: town.version || 0,
                  image,
                  ...(residentUids ? { residentUids } : {}),
                }
              : {}),
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
      {town && (
        <>
          <label>
            Town cover image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || processing}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setProcessing(true);
                setError("");
                try {
                  setImage(await prepareTownPhoto(file));
                } catch (reason) {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Could not open image.",
                  );
                } finally {
                  setProcessing(false);
                }
              }}
            />
          </label>
          {processing && <LoadingStatus>Preparing cover image�</LoadingStatus>}
          <img
            className="town-cover-preview"
            src={image}
            alt="Town cover preview"
          />
          <label>
            Residents in The Records Project
            <select
              aria-label="Add a town resident"
              value=""
              disabled={loading || busy || residentNames.length >= 500}
              onChange={(event) => {
                const value = event.target.value;
                if (value) setResidentNames((current) => [...current, value]);
              }}
            >
              <option value="">Select a registered user to add</option>
              {users.map((user) => (
                <option
                  key={user.uid}
                  value={user.username}
                  disabled={residentNames.some(
                    (name) =>
                      name.toLowerCase() === user.username.toLowerCase(),
                  )}
                >
                  {user.username}
                </option>
              ))}
            </select>
          </label>
          <ul className="town-residents">
            {residentNames.map((name) => (
              <li key={name}>
                {name}
                <button
                  type="button"
                  disabled={
                    busy ||
                    mayors.some(
                      (uid) =>
                        users
                          .find((user) => user.uid === uid)
                          ?.username.toLowerCase() === name.toLowerCase(),
                    )
                  }
                  aria-label={"Remove resident " + name}
                  onClick={() =>
                    setResidentNames((current) =>
                      current.filter((value) => value !== name),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="login-note">
            Mayors stay on the resident list. Editing this list manages TRP
            membership only. EarthMC population and claimed chunks are supplied
            automatically by EarthMC.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <button
          type="button"
          disabled={busy || processing}
          onClick={(event) => leave(event.currentTarget, onCancel)}
        >
          Cancel
        </button>
        <button
          disabled={
            busy ||
            processing ||
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
