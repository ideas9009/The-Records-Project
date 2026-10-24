import { useEffect, useRef, useState } from "react";
import EarthMcTownSummary, {
  TownValue,
  townObject,
  townText,
  validEarthMcId,
} from "./EarthMcTownSummary";
import EarthMcDetailTables from "./EarthMcDetailTables";
import MinecraftFace from "./MinecraftFace";
import { LoadingStatus } from "./Loading";
import { apiRequest } from "../lib/api";
import {
  townPlots,
  plotBounds,
  quarterReferences,
  type EarthMcPlot,
} from "../lib/earthmc-town-details";
import "./earthmc-town-details.css";
type Data = Record<string, unknown>;
type Props = { town: Data; townId: string; onPlayer: (id: string) => void };
const human = (key: string) =>
  (
    ({
      uuid: "Record ID",
      timestamps: "Dates",
      perms: "Permissions",
      stats: "Statistics",
      quarters: "Apartments/Quarters",
      bankhistory: "Bank history",
    }) as Record<string, string>
  )[key] ||
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
function PlayerButton({
  value,
  onPlayer,
}: {
  value: unknown;
  onPlayer: Props["onPlayer"];
}) {
  const player = townObject(value),
    id = player.uuid,
    name = townText(player.name) || "Unknown player";
  return (
    <button
      className="town-person"
      disabled={!validEarthMcId(id)}
      onClick={() => validEarthMcId(id) && onPlayer(id)}
      aria-label={"View EarthMC player " + name}
    >
      <MinecraftFace username={name} uuid={townText(id)} />
      <span>{name}</span>
      <span className="material-symbol" aria-hidden="true">
        chevron_right
      </span>
    </button>
  );
}
export function TownPeople({
  title,
  value,
  onPlayer,
}: {
  title: string;
  value: unknown;
  onPlayer: Props["onPlayer"];
}) {
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(20);
  const people = Array.isArray(value)
    ? value
        .map(townObject)
        .filter((p) => typeof p.name === "string")
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    : [];
  const filtered = people.filter((p) =>
    String(p.name).toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <section className="card town-section">
      <div className="town-section-heading">
        <h2>
          {title} <span className="citizens-muted">({people.length})</span>
        </h2>
        <label className="citizens-search">
          <span className="material-symbol" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label={"Search " + title.toLowerCase()}
            placeholder="Search players"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(20);
            }}
          />
        </label>
      </div>
      <div className="town-people-grid">
        {filtered.slice(0, limit).map((person, i) => (
          <PlayerButton
            key={townText(person.uuid) || i}
            value={person}
            onPlayer={onPlayer}
          />
        ))}
      </div>
      {!filtered.length && (
        <p className="citizens-muted">
          {search ? "No matching players." : "No public players listed."}
        </p>
      )}
      {filtered.length > limit && (
        <button
          className="earthmc-more-residents"
          onClick={() => setLimit((n) => n + 20)}
        >
          Show more players
        </button>
      )}
    </section>
  );
}
function InfoSections({
  data,
  exclude = [],
  onPlayer,
  entity = "town",
}: {
  data: Data;
  exclude?: string[];
  entity?: "town" | "quarter";
  onPlayer: Props["onPlayer"];
}) {
  return (
    <div className="town-info-sections">
      {Object.entries(data)
        .filter(([key]) => !exclude.includes(key))
        .map(([key, value]) => (
          <section className="card town-section" key={key}>
            <h2>{human(key)}</h2>
            {["perms", "stats", "status", "timestamps"].includes(key) ? (
              <EarthMcDetailTables
                entity={entity}
                section={key}
                value={value}
                render={(item, field) => (
                  <TownValue value={item} field={field} />
                )}
              />
            ) : key === "trusted" ? (
              <TownPeople
                title="Trusted players"
                value={value}
                onPlayer={onPlayer}
              />
            ) : (
              <TownValue value={value} field={key} />
            )}
          </section>
        ))}
    </div>
  );
}
export function ApartmentInfo({
  quarter,
  onPlayer,
}: {
  quarter: Data;
  onPlayer: Props["onPlayer"];
}) {
  const owner = townObject(quarter.owner),
    stats = townObject(quarter.stats);
  return (
    <>
      <section className="card town-section">
        <div className="town-section-heading">
          <h2>{townText(quarter.name) || "Unnamed apartment"}</h2>
          <span className="badge">
            {townText(quarter.type).replaceAll("_", " ").toLowerCase() ||
              "Apartment/Quarter"}
          </span>
        </div>
        <dl className="citizen-facts earthmc-facts">
          <div>
            <dt>Owner</dt>
            <dd>
              {validEarthMcId(owner.uuid) ? (
                <PlayerButton value={owner} onPlayer={onPlayer} />
              ) : (
                townText(owner.name) || "Unowned"
              )}
            </dd>
          </div>
          <div>
            <dt>Town</dt>
            <dd>{townText(townObject(quarter.town).name) || "Unavailable"}</dd>
          </div>
          <div>
            <dt>Sale price</dt>
            <dd>
              {typeof stats.price === "number"
                ? stats.price.toLocaleString() + " Gold"
                : townObject(quarter.status).isForSale === false
                  ? "Not for sale"
                  : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>
              {typeof stats.volume === "number"
                ? stats.volume.toLocaleString() + " blocks"
                : "Unavailable"}
            </dd>
          </div>
        </dl>
      </section>
      <TownPeople
        title="Trusted players"
        value={quarter.trusted}
        onPlayer={onPlayer}
      />
      {Array.isArray(quarter.cuboids) && (
        <section className="card town-section">
          <h2>Apartment boundaries</h2>
          <div className="earthmc-table-scroll">
            <table className="earthmc-info-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Block X range</th>
                  <th>Height (Y)</th>
                  <th>Block Z range</th>
                </tr>
              </thead>
              <tbody>
                {quarter.cuboids.slice(0, 50).map((item, index) => {
                  const bounds = townObject(item),
                    a = bounds.cornerOne ?? bounds.pos1,
                    b = bounds.cornerTwo ?? bounds.pos2;
                  return (
                    <tr key={index}>
                      <th scope="row">{index + 1}</th>
                      {[0, 1, 2].map((axis) => (
                        <td key={axis}>
                          {Array.isArray(a) &&
                          Array.isArray(b) &&
                          typeof a[axis] === "number" &&
                          typeof b[axis] === "number"
                            ? Math.min(a[axis], b[axis]).toLocaleString() +
                              " to " +
                              Math.max(a[axis], b[axis]).toLocaleString()
                            : "Unavailable"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {quarter.cuboids.length > 50 && (
            <TownValue value={quarter.cuboids.slice(50)} />
          )}
        </section>
      )}
      <details className="card town-section">
        <summary>More apartment details</summary>
        <InfoSections
          data={quarter}
          entity="quarter"
          exclude={["name", "type", "owner", "town", "trusted", "cuboids"]}
          onPlayer={onPlayer}
        />
      </details>
    </>
  );
}
function Apartments({ town, townId, onPlayer }: Props) {
  const entries = quarterReferences(town.quarters);
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(24),
    [selected, setSelected] = useState<{ name: string; uuid: string } | null>(
      null,
    );
  const [detail, setDetail] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetail(null);
    setError("");
    setLoading(true);
    heading.current?.focus();
    apiRequest<{ quarter: Data }>(
      "/api/earthmc/towns/" +
        encodeURIComponent(townId) +
        "/quarters/" +
        encodeURIComponent(selected.uuid),
      { networkOnly: true },
    )
      .then((result) => {
        if (active) setDetail(result.quarter);
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
  }, [townId, selected, retry]);
  const filtered = entries.filter((q) =>
    q.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (selected)
    return (
      <div className="town-apartment-detail">
        <button
          className="citizens-back"
          onClick={() => {
            setSelected(null);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        >
          <span className="material-symbol" aria-hidden="true">
            arrow_back
          </span>
          Apartments/Quarters
        </button>
        <h2
          ref={heading}
          tabIndex={-1}
          className={detail ? "town-focus-heading" : undefined}
        >
          {townText(selected.name)}
        </h2>
        {loading && <LoadingStatus>Loading apartment details...</LoadingStatus>}
        {error && (
          <section className="card town-section">
            <p role="alert">{error}</p>
            <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
          </section>
        )}
        {detail && <ApartmentInfo quarter={detail} onPlayer={onPlayer} />}
      </div>
    );
  return (
    <section className="card town-section">
      <div className="town-section-heading">
        <h2 ref={heading} tabIndex={-1}>
          Apartments/Quarters{" "}
          <span className="citizens-muted">({entries.length})</span>
        </h2>
        <label className="citizens-search">
          <span className="material-symbol" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label="Search apartments and quarters"
            placeholder="Search apartments"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(24);
            }}
          />
        </label>
      </div>
      <div className="town-property-grid">
        {filtered.slice(0, limit).map((q) => (
          <button
            key={q.uuid}
            className="town-property"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setSelected(q);
            }}
          >
            <span
              className="material-symbol town-property-icon"
              aria-hidden="true"
            >
              apartment
            </span>
            <span>
              <strong>{townText(q.name)}</strong>
              <small>View apartment details</small>
            </span>
            <span className="material-symbol" aria-hidden="true">
              chevron_right
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p className="citizens-muted">
          {search
            ? "No matching apartments."
            : "No apartments or quarters listed."}
        </p>
      )}
      {filtered.length > limit && (
        <button
          className="earthmc-more-residents"
          onClick={() => setLimit((n) => n + 24)}
        >
          Show more apartments
        </button>
      )}
    </section>
  );
}
export function PlotInfo({
  plot,
  townName,
}: {
  plot: EarthMcPlot;
  townName: string;
}) {
  const bounds = plotBounds(plot);
  return (
    <section className="card town-section">
      <div className="town-section-heading">
        <h2>
          Claimed plot · {plot.x}, {plot.z}
        </h2>
        {plot.home && <span className="badge">Home plot</span>}
      </div>
      <dl className="citizen-facts earthmc-facts">
        {Object.entries({
          Town: townName,
          World: plot.world,
          "Chunk coordinates": plot.x + ", " + plot.z,
          "Block X range": bounds.minX + " to " + bounds.maxX,
          "Block Z range": bounds.minZ + " to " + bounds.maxZ,
          Size: "16 × 16 blocks",
          "Plot name": "Not provided by EarthMC",
          "Individual owner": "Not provided by EarthMC",
        }).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function Plots({ town }: { town: Data }) {
  const plots = townPlots(town),
    worlds = [...new Set(plots.map((p) => p.world))];
  const [world, setWorld] = useState("all"),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(24),
    [selected, setSelected] = useState<EarthMcPlot | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
  const filtered = plots.filter(
    (p) =>
      (world === "all" || p.world === world) &&
      ((p.x + ", " + p.z).includes(search.trim()) ||
        (p.home && "home plot".includes(search.toLowerCase().trim()))),
  );
  if (selected)
    return (
      <>
        <button
          className="citizens-back"
          onClick={() => {
            setSelected(null);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        >
          <span className="material-symbol" aria-hidden="true">
            arrow_back
          </span>
          Claimed plots
        </button>
        <h2 className="town-focus-heading" tabIndex={-1} ref={heading}>
          Plot details
        </h2>
        <PlotInfo plot={selected} townName={townText(town.name)} />
      </>
    );
  return (
    <section className="card town-section">
      <div className="town-section-heading">
        <h2 ref={heading} tabIndex={-1}>
          Claimed plots <span className="citizens-muted">({plots.length})</span>
        </h2>
        <div className="citizens-toolbar">
          <label className="citizens-search">
            <span className="material-symbol" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              aria-label="Search claimed plot coordinates"
              placeholder="Search chunk coordinates"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(24);
              }}
            />
          </label>
          {worlds.length > 1 && (
            <select
              aria-label="Filter plots by world"
              value={world}
              onChange={(e) => {
                setWorld(e.target.value);
                setLimit(24);
              }}
            >
              <option value="all">All worlds</option>
              {worlds.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <p className="citizens-muted">
        EarthMC shares chunk coordinates here, but does not provide plot names
        or individual plot owners. Named apartments are in Apartments/Quarters.
      </p>
      <div className="town-property-grid">
        {filtered.slice(0, limit).map((p) => (
          <button
            key={p.world + ":" + p.x + ":" + p.z}
            className="town-property"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setSelected(p);
            }}
          >
            <span
              className="material-symbol town-property-icon"
              aria-hidden="true"
            >
              {p.home ? "home" : "grid_view"}
            </span>
            <span>
              <strong>
                {p.home ? "Home plot" : "Claimed plot"} · {p.x}, {p.z}
              </strong>
              <small>{p.world} · View location</small>
            </span>
            <span className="material-symbol" aria-hidden="true">
              chevron_right
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && <p className="citizens-muted">No matching plots.</p>}
      {filtered.length > limit && (
        <button
          className="earthmc-more-residents"
          onClick={() => setLimit((n) => n + 24)}
        >
          Show more plots ({filtered.length - limit} remaining)
        </button>
      )}
    </section>
  );
}
export default function EarthMcTownDetails(props: Props) {
  const { town, onPlayer } = props;
  const [tab, setTab] = useState("overview"),
    tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const sections = [
    ["overview", "Overview"],
    ["residents", "Residents"],
    ["trusted", "Trusted players"],
    ["quarters", "Apartments/Quarters"],
    ["plots", "Claimed plots"],
    ["details", "More details"],
  ];
  const counts: Record<string, number> = {
    residents: Array.isArray(town.residents) ? town.residents.length : 0,
    trusted: Array.isArray(town.trusted) ? town.trusted.length : 0,
    quarters: quarterReferences(town.quarters).length,
    plots: townPlots(town).length,
  };
  return (
    <div className="town-detail-content">
      <div
        role="tablist"
        aria-label="Town information"
        className="town-detail-tabs"
      >
        {sections.map(([id, name], index) => (
          <button
            key={id}
            id={"town-tab-" + id}
            role="tab"
            type="button"
            ref={(element) => {
              tabs.current[index] = element;
            }}
            aria-selected={tab === id}
            aria-controls="town-information-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              let next = index;
              if (e.key === "ArrowRight") next = (index + 1) % sections.length;
              else if (e.key === "ArrowLeft")
                next = (index + sections.length - 1) % sections.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = sections.length - 1;
              else return;
              e.preventDefault();
              setTab(sections[next][0]);
              tabs.current[next]?.focus();
            }}
          >
            {name}
            {id in counts && <span>{counts[id]}</span>}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="town-information-panel"
        aria-labelledby={"town-tab-" + tab}
        tabIndex={0}
        className="town-information-panel"
      >
        {tab === "overview" && (
          <EarthMcTownSummary town={town} onPlayer={onPlayer} overviewOnly />
        )}
        {tab === "residents" && (
          <TownPeople
            key="residents"
            title="Residents"
            value={town.residents}
            onPlayer={onPlayer}
          />
        )}
        {tab === "trusted" && (
          <TownPeople
            key="trusted"
            title="Trusted players"
            value={town.trusted}
            onPlayer={onPlayer}
          />
        )}
        {tab === "quarters" && <Apartments {...props} />}
        {tab === "plots" && <Plots town={town} />}
        {tab === "details" && (
          <>
            <InfoSections
              data={town}
              exclude={[
                "name",
                "board",
                "mayor",
                "nation",
                "residents",
                "trusted",
                "quarters",
                "coordinates",
                "outlaws",
                "ranks",
                "uuid",
              ]}
              onPlayer={onPlayer}
            />
            <TownPeople
              title="Outlaws"
              value={town.outlaws}
              onPlayer={onPlayer}
            />
            <section className="card town-section">
              <h2>Town ranks</h2>
              {Object.entries(townObject(town.ranks)).map(([rank, value]) => (
                <TownPeople
                  key={rank}
                  title={rank}
                  value={
                    Array.isArray(value)
                      ? value.map((item) =>
                          typeof item === "string"
                            ? (Array.isArray(town.residents)
                                ? town.residents
                                    .map(townObject)
                                    .find((p) => p.name === item)
                                : null) || { name: item }
                            : item,
                        )
                      : []
                  }
                  onPlayer={onPlayer}
                />
              ))}
            </section>
            <details className="card town-section">
              <summary>Record and location details</summary>
              <InfoSections
                data={{
                  uuid: town.uuid,
                  mayor: town.mayor,
                  nation: town.nation,
                  coordinates: Object.fromEntries(
                    Object.entries(townObject(town.coordinates)).filter(
                      ([key]) => !["townBlocks", "worlds"].includes(key),
                    ),
                  ),
                }}
                onPlayer={onPlayer}
              />
            </details>
          </>
        )}
      </div>
    </div>
  );
}
