import CitizenEarthMc from "../components/CitizenEarthMc";
import { useEffect, useRef, useState } from "react";
import { watchResource } from "../lib/api";
import { type Citizen, filterCitizens } from "../lib/citizens";
import { roleNames, type Role, canPerform } from "../lib/access";
import { useAuth } from "../lib/auth-context";
import { PREVIEW_MODE, previewAccount } from "../lib/runtime-mode";
import { LoadingStatus } from "../components/Loading";
import { SyncStatus } from "../components/SmartSync";
import "./Citizens.css";
function Icon({ name }: { name: string }) {
  return (
    <span className="material-symbol" aria-hidden="true">
      {name}
    </span>
  );
}
function RoleBadges({ roles }: { roles: Role[] }) {
  return (
    <div className="citizen-roles" aria-label="Roles">
      {roles.map((role) => (
        <span className="citizen-role" key={role}>
          {roleNames[role]}
        </span>
      ))}
    </div>
  );
}
const sample: Citizen = {
  uid: previewAccount.uid,
  username: previewAccount.username,
  roles: ["operator", "minister", "mayor"],
  joinedAt: null,
  towns: [{ id: "test-town", name: "Test Town", mayor: true }],
};
function useDirectory<T>(path: string, fixture: T) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setData(null);
    setLoading(true);
    setError("");
    if (PREVIEW_MODE) {
      setData(fixture);
      setLoading(false);
      return;
    }
    return watchResource<T>(
      path,
      (value) => {
        setData(value);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setData(null);
        setLoading(false);
        setError(reason.message);
      },
    );
  }, [path, attempt]);
  return {
    data,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
export default function Citizens({
  citizenId,
  onOpen,
  onBack,
  onTown,
  onEarthMc,
}: {
  citizenId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  onTown: (id: string) => void;
  onEarthMc: () => void;
}) {
  const { account } = useAuth(),
    [search, setSearch] = useState(""),
    [role, setRole] = useState<Role | "all">("all"),
    heading = useRef<HTMLHeadingElement>(null);
  const path = citizenId
    ? "/api/citizens/" + encodeURIComponent(citizenId)
    : "/api/citizens";
  const { data, loading, error, retry } = useDirectory<Citizen[] | Citizen>(
    path,
    citizenId ? sample : [sample],
  );
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [citizenId]);
  const citizen = citizenId && data && !Array.isArray(data) ? data : null;
  const filtered = filterCitizens(
    Array.isArray(data) ? data : [],
    search,
    role,
  );
  return (
    <div className="citizens-page">
      {citizenId && (
        <button className="citizens-back" onClick={onBack}>
          <Icon name="arrow_back" />
          Citizens
        </button>
      )}
      <header className="page-header">
        <h1 ref={heading} tabIndex={-1}>
          {citizenId ? citizen?.username || "Citizen Profile" : "Citizens"}
        </h1>
        {!citizenId && (
          <button onClick={onEarthMc}>
            <Icon name="public" />
            View people on EarthMC
          </button>
        )}
      </header>
      {!citizenId && (
        <div className="citizens-toolbar">
          <label className="citizens-search">
            <Icon name="search" />
            <input
              type="search"
              aria-label="Search citizens"
              placeholder="Search citizens"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter citizens by role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role | "all")}
          >
            <option value="all">All roles</option>
            {Object.entries(roleNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          {!loading && !error && (
            <span className="citizens-count" role="status">
              {filtered.length} {filtered.length === 1 ? "citizen" : "citizens"}
            </span>
          )}
        </div>
      )}
      {loading && <LoadingStatus>Loading citizens…</LoadingStatus>}
      <SyncStatus path={path} />
      {error && (
        <section className="card citizens-empty">
          <p role="alert">{error}</p>
          <button onClick={retry}>Try again</button>
        </section>
      )}
      {citizen ? (
        <>
          <section className="card citizen-profile">
            <span
              className="citizen-avatar citizen-avatar-large"
              aria-hidden="true"
            >
              {citizen.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h2>{citizen.username}</h2>
              <RoleBadges roles={citizen.roles} />
            </div>
          </section>
          <div className="citizen-profile-grid">
            <section className="card">
              <h2>TRP Profile</h2>
              <dl className="citizen-facts">
                <div>
                  <dt>Minecraft Username</dt>
                  <dd>{citizen.username}</dd>
                </div>
                {citizen.joinedAt && (
                  <div>
                    <dt>Joined The Records Project</dt>
                    <dd>{new Date(citizen.joinedAt).toLocaleDateString()}</dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="card">
              <h2>Towns</h2>
              {citizen.towns.length ? (
                <ul className="citizen-towns">
                  {citizen.towns.map((town) => (
                    <li key={town.id}>
                      <button
                        disabled={!canPerform(account, "open-town")}
                        onClick={() => onTown(town.id)}
                      >
                        <Icon name="location_city" />
                        <span>
                          <strong>{town.name}</strong>
                          <small>{town.mayor ? "Mayor" : "Resident"}</small>
                        </span>
                        <Icon name="arrow_forward" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="citizens-muted">No registered town.</p>
              )}
            </section>
          </div>
          {!PREVIEW_MODE && (
            <CitizenEarthMc key={citizen.uid} uid={citizen.uid} />
          )}
        </>
      ) : (
        !citizenId &&
        !error && (
          <>
            <div className="citizens-grid">
              {filtered.map((person) => (
                <button
                  className="card citizen-card"
                  key={person.uid}
                  onClick={() => onOpen(person.uid)}
                  aria-label={"View " + person.username}
                >
                  <span className="citizen-avatar" aria-hidden="true">
                    {person.username.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="citizen-card-info">
                    <h2>{person.username}</h2>
                    <p>
                      {person.towns.map((town) => town.name).join(" · ") ||
                        "No registered town"}
                    </p>
                    <RoleBadges roles={person.roles} />
                  </div>
                  <Icon name="arrow_forward" />
                </button>
              ))}
            </div>
            {!loading && !filtered.length && (
              <section className="card citizens-empty">
                <Icon
                  name={search || role !== "all" ? "search_off" : "groups"}
                />
                <h2>
                  {search || role !== "all"
                    ? "No matching citizens"
                    : "No citizens registered"}
                </h2>
                {(search || role !== "all") && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setRole("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
