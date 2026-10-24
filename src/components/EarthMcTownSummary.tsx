import { useState } from "react";
import MinecraftFace from "./MinecraftFace";
import { EarthMcValue } from "../pages/EarthMcPeople";

export const townObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const townText = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/\u00a7[0-9a-fk-or]/gi, "")
        .trim()
    : "";
export const validEarthMcId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "Unavailable";
const label = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());

// Large claim-coordinate and resident arrays expand in batches to keep the page responsive.
export function TownValue({
  value,
  field = "",
  depth = 0,
}: {
  value: unknown;
  field?: string;
  depth?: number;
}) {
  const [limit, setLimit] = useState(50);
  if (Array.isArray(value))
    return value.length ? (
      <>
        <ul className="earthmc-value-list">
          {value.slice(0, limit).map((item, index) => (
            <li key={index}>
              <TownValue value={item} depth={depth + 1} />
            </li>
          ))}
        </ul>
        {value.length > limit && (
          <button onClick={() => setLimit((count) => count + 50)}>
            Show more ({(value.length - limit).toLocaleString()} remaining)
          </button>
        )}
      </>
    ) : (
      <span className="citizens-muted">None</span>
    );
  if (value && typeof value === "object" && depth < 8)
    return (
      <dl className="earthmc-value-object">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>
              <TownValue value={item} field={key} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <EarthMcValue value={value} field={field} depth={depth} />;
}

export default function EarthMcTownSummary({
  town,
  onPlayer,
  overviewOnly = false,
}: {
  town: Record<string, unknown>;
  overviewOnly?: boolean;
  onPlayer: (id: string) => void;
}) {
  const [residentLimit, setResidentLimit] = useState(20);
  const stats = townObject(town.stats),
    status = townObject(town.status),
    timestamps = townObject(town.timestamps);
  const mayor = townObject(town.mayor),
    nation = townObject(town.nation),
    spawn = townObject(townObject(town.coordinates).spawn);
  const residents = Array.isArray(town.residents)
    ? town.residents.map(townObject)
    : [];
  const date =
    typeof timestamps.registered === "number" &&
    timestamps.registered > 0 &&
    timestamps.registered < 8640000000000000
      ? new Date(timestamps.registered).toLocaleDateString()
      : "Unavailable";
  const facts = {
    Nation: townText(nation.name) || "No nation",
    Residents: number(stats.numResidents),
    "Claimed chunks": number(stats.numTownBlocks),
    "Maximum chunks": number(stats.maxTownBlocks),
    "Bank balance":
      typeof stats.balance === "number"
        ? number(stats.balance) + " Gold"
        : "Unavailable",
    Founded: date,
  };
  return (
    <>
      <section className="card earthmc-overview">
        <div className="earthmc-profile-heading">
          <h2>Town overview</h2>
          {status.isCapital === true && <span className="badge">Capital</span>}
        </div>
        {townText(town.board) && (
          <p className="earthmc-about">{townText(town.board)}</p>
        )}
        <dl className="citizen-facts earthmc-facts">
          <div>
            <dt>Mayor</dt>
            <dd>
              {validEarthMcId(mayor.uuid) ? (
                <button onClick={() => onPlayer(mayor.uuid as string)}>
                  <MinecraftFace
                    username={townText(mayor.name)}
                    uuid={mayor.uuid}
                  />
                  {townText(mayor.name) || "View mayor"}
                </button>
              ) : (
                townText(mayor.name) || "Unavailable"
              )}
            </dd>
          </div>
          {Object.entries(facts).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt>Public spawn</dt>
            <dd>
              {status.isPublic === true
                ? "Yes"
                : status.isPublic === false
                  ? "No"
                  : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Open to join</dt>
            <dd>
              {status.isOpen === true
                ? "Yes"
                : status.isOpen === false
                  ? "No"
                  : "Unavailable"}
            </dd>
          </div>
          {["x", "y", "z"].every(
            (key) =>
              typeof spawn[key] === "number" && Number.isFinite(spawn[key]),
          ) && (
            <div>
              <dt>Spawn coordinates</dt>
              <dd>
                {townText(spawn.world)} ·{" "}
                {["x", "y", "z"].map((key) => number(spawn[key])).join(", ")}
              </dd>
            </div>
          )}
        </dl>
      </section>
      {!overviewOnly && (
        <section className="card earthmc-friends-section">
          <h2>
            Residents{" "}
            <span className="citizens-muted">
              ({residents.length.toLocaleString()})
            </span>
          </h2>
          {residents.length ? (
            <>
              <div className="earthmc-friend-grid">
                {residents.slice(0, residentLimit).map((resident, index) => (
                  <button
                    key={townText(resident.uuid) || index}
                    disabled={!validEarthMcId(resident.uuid)}
                    onClick={() => onPlayer(resident.uuid as string)}
                  >
                    <MinecraftFace
                      username={townText(resident.name)}
                      uuid={townText(resident.uuid)}
                    />
                    <span>{townText(resident.name) || "Unknown player"}</span>
                  </button>
                ))}
              </div>
              {residents.length > residentLimit && (
                <button
                  className="earthmc-more-residents"
                  onClick={() => setResidentLimit((count) => count + 20)}
                >
                  Show more residents
                </button>
              )}
            </>
          ) : (
            <p className="citizens-muted">No public residents listed.</p>
          )}
        </section>
      )}
    </>
  );
}
