import EarthMcDetailTables from "../components/EarthMcDetailTables";
import EarthMcProfileSummary from "../components/EarthMcProfileSummary";
import MinecraftFace from "../components/MinecraftFace";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus } from "../components/Loading";
import "./Citizens.css";
import "./EarthMcPeople.css";
type Person = { name: string; uuid: string };
type Directory = { players: Person[]; nations: Person[]; checkedAt: string };
const label = (key: string) =>
  (({ perms: "Permissions", stats: "Statistics" }) as Record<string, string>)[
    key
  ] ||
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase());
export function EarthMcValue({
  value,
  field = "",
  depth = 0,
}: {
  value: unknown;
  field?: string;
  depth?: number;
}) {
  if (value == null)
    return <span className="citizens-muted">Not provided</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number")
    return (
      <span>
        {["registered", "joinedTownAt", "lastOnline"].includes(field) &&
        value > 0 &&
        value < 8640000000000000
          ? new Date(value).toLocaleString()
          : value.toLocaleString()}
      </span>
    );
  if (typeof value !== "object")
    return (
      <span>
        {String(value)
          .replace(/<[^>]*>/g, "")
          .replace(/\u00a7[0-9a-fk-or]/gi, "")}
      </span>
    );
  if (depth > 8) return <pre>{JSON.stringify(value, null, 2)}</pre>;
  if (Array.isArray(value))
    return value.length ? (
      <ul className="earthmc-value-list">
        {value.map((item, index) => (
          <li key={index}>
            <EarthMcValue value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="citizens-muted">None</span>
    );
  return (
    <dl className="earthmc-value-object">
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <dt>{label(key)}</dt>
          <dd>
            <EarthMcValue value={item} field={key} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export default function EarthMcPeople({
  playerId,
  onOpen,
  onBack,
  onCitizens,
}: {
  playerId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  onCitizens: () => void;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [list, setList] = useState<Person[]>([]),
    [nation, setNation] = useState("all"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<{
      player: Record<string, unknown>;
      checkedAt: string;
    } | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [detailAttempt, setDetailAttempt] = useState(0);
  const [precise, setPrecise] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    setPrecise(false);
  }, [playerId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiRequest<Directory>("/api/earthmc/directory", { networkOnly: true })
      .then((result) => {
        if (active) setDirectory(result);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!directory) return;
    let active = true;
    setList([]);
    setPage(0);
    setError("");
    if (nation === "all") {
      setList(directory.players);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiRequest<{ players: Person[] }>(
      "/api/earthmc/nations/" + encodeURIComponent(nation) + "/players",
      { networkOnly: true },
    )
      .then((result) => {
        if (active) setList(result.players);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [directory, nation]);
  useEffect(() => {
    if (!playerId) return;
    let active = true;
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    apiRequest<{ player: Record<string, unknown>; checkedAt: string }>(
      "/api/earthmc/players/" + encodeURIComponent(playerId),
      { networkOnly: true },
    )
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((reason) => {
        if (active) setDetailError(reason.message);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [playerId, detailAttempt]);
  const filtered = useMemo(
    () =>
      list.filter((person) =>
        person.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [list, search],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 60)),
    current = Math.min(page, pages - 1);
  if (playerId)
    return (
      <div className="citizens-page earthmc-people">
        <button className="citizens-back" onClick={onBack}>
          <span className="material-symbol" aria-hidden="true">
            arrow_back
          </span>
          EarthMC people
        </button>
        <header className="page-header">
          <div className="minecraft-identity">
            {typeof detail?.player.name === "string" && (
              <MinecraftFace
                username={detail.player.name}
                uuid={playerId}
                className="profile-face"
                variant="body"
                eager
              />
            )}
            <h1 ref={heading} tabIndex={-1}>
              {typeof detail?.player.name === "string"
                ? detail.player.name
                : "EarthMC Player"}
            </h1>
          </div>
          <button
            disabled={detailLoading}
            onClick={() => setDetailAttempt((value) => value + 1)}
          >
            Refresh
          </button>
        </header>
        {detailLoading && (
          <LoadingStatus>Loading EarthMC player...</LoadingStatus>
        )}
        {detailError && (
          <section className="card">
            <p role="alert">{detailError}</p>
            <button onClick={() => setDetailAttempt((value) => value + 1)}>
              Try again
            </button>
          </section>
        )}
        {detail && (
          <>
            <EarthMcProfileSummary player={detail.player} onOpen={onOpen} />
            <p className="citizens-muted earthmc-updated">
              Updated {new Date(detail.checkedAt).toLocaleString()}
            </p>
            <button
              className="earthmc-precise-toggle"
              aria-expanded={precise}
              aria-controls="earthmc-precise-info"
              onClick={() => setPrecise((value) => !value)}
            >
              <span className="material-symbol" aria-hidden="true">
                {precise ? "expand_less" : "expand_more"}
              </span>
              {precise ? "Hide more precise info" : "Show more precise info"}
            </button>
            {precise && (
              <section
                id="earthmc-precise-info"
                className="earthmc-details"
                aria-label="Precise player information"
              >
                {Object.entries(detail.player).map(([key, value]) => (
                  <section
                    className={
                      "card " +
                      (["perms", "stats", "status", "timestamps"].includes(key)
                        ? "earthmc-wide-detail-card"
                        : "")
                    }
                    key={key}
                  >
                    <h2>{label(key)}</h2>
                    {["perms", "stats", "status", "timestamps"].includes(
                      key,
                    ) ? (
                      <EarthMcDetailTables
                        section={key}
                        value={value}
                        render={(item, field) => (
                          <EarthMcValue value={item} field={field} />
                        )}
                      />
                    ) : key === "discord" ? (
                      typeof value === "string" && /^\d{15,22}$/.test(value) ? (
                        <div className="earthmc-discord-info">
                          <div>
                            <span className="citizens-muted">
                              Discord user ID
                            </span>
                            <p>{value}</p>
                          </div>
                          <a
                            href={"https://discord.com/users/" + value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="earthmc-discord-link"
                          >
                            Open Discord profile
                            <span
                              className="material-symbol"
                              aria-hidden="true"
                            >
                              open_in_new
                            </span>
                          </a>
                        </div>
                      ) : (
                        <EarthMcValue value={value} field={key} />
                      )
                    ) : (
                      <EarthMcValue value={value} field={key} />
                    )}
                  </section>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="citizens-page earthmc-people">
      <button className="citizens-back" onClick={onCitizens}>
        <span className="material-symbol" aria-hidden="true">
          arrow_back
        </span>
        Citizens
      </button>
      <header className="page-header">
        <h1 ref={heading} tabIndex={-1}>
          People on EarthMC
        </h1>
        <button
          disabled={loading}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh
        </button>
      </header>
      <div className="citizens-toolbar">
        <label className="citizens-search">
          <span className="material-symbol" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label="Search EarthMC players"
            placeholder="Search EarthMC players"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="earthmc-nation-filter">
          <span>Nation</span>
          <select
            aria-label="Filter EarthMC players by nation"
            value={nation}
            onChange={(event) => setNation(event.target.value)}
          >
            <option value="all">All players</option>
            {directory?.nations.map((item) => (
              <option key={item.uuid} value={item.uuid}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {directory?.nations.some(
          (item) => item.name.toLowerCase() === "byzantium",
        ) && (
          <button
            onClick={() =>
              setNation(
                directory.nations.find(
                  (item) => item.name.toLowerCase() === "byzantium",
                )!.uuid,
              )
            }
          >
            Byzantium citizens
          </button>
        )}
      </div>
      {loading && <LoadingStatus>Loading EarthMC people...</LoadingStatus>}
      {error && (
        <section className="card">
          <p role="alert">{error}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </section>
      )}
      {!loading && !error && (
        <>
          <p className="citizens-muted" role="status">
            {filtered.length.toLocaleString()} players / Page {current + 1} of{" "}
            {pages}
          </p>
          <div className="citizens-grid">
            {filtered.slice(current * 60, (current + 1) * 60).map((person) => (
              <button
                className="card citizen-card"
                key={person.uuid}
                onClick={() => onOpen(person.uuid)}
                aria-label={"View EarthMC player " + person.name}
              >
                <MinecraftFace
                  username={person.name}
                  uuid={person.uuid}
                  className="citizen-avatar"
                />
                <div className="citizen-card-info">
                  <h2>{person.name}</h2>
                </div>
                <span className="material-symbol" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <section className="card citizens-empty">
              No matching players.
            </section>
          )}
          <div
            role="navigation"
            className="earthmc-pagination"
            aria-label="EarthMC player pages"
          >
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      <p className="citizens-muted">
        Public EarthMC records. Players who opt out of the API are unavailable.
      </p>
    </div>
  );
}
