import type { AiRoute } from "../lib/ai-actions";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  expansionBudget,
  verifiedAiRouteSelection,
  connectedClaimSelection,
  type TownSuggestionsData,
} from "../lib/town-suggestions";
import "./TownSuggestions.css";
export default function TownSuggestions({
  townId,
  initialRoute,
  onBack,
}: {
  townId: string;
  initialRoute?: AiRoute;
  onBack: () => void;
}) {
  const [data, setData] = useState<TownSuggestionsData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [claims, setClaims] = useState(0),
    [overclaims, setOverclaims] = useState(0),
    [reserve, setReserve] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [focus, setFocus] = useState<[number, number]>([0, 0]),
    [range, setRange] = useState(32);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setSelected([]);
    setClaims(0);
    setOverclaims(0);
    void apiRequest<TownSuggestionsData>(
      "/api/towns/" + encodeURIComponent(townId) + "/suggestions",
      { networkOnly: true },
    )
      .then((value) => {
        if (active) {
          setData(value);
          fitArea(value);
          if(initialRoute?.townId===townId){
            const connected=verifiedAiRouteSelection(value,initialRoute.points);
            setSelected(connected);setClaims(connected.length);
          }
        }
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
  }, [townId, attempt, initialRoute]);
  const directions = useMemo(
    () =>
      ["North", "East", "South", "West"]
        .map((name) => ({
          name,
          count:
            data?.cells.filter(
              (c) =>
                c.state === "free" &&
                (c.reachable ?? c.adjacent ?? true) &&
                c.direction === name,
            ).length || 0,
        }))
        .sort((a, b) => b.count - a.count),
    [data],
  );
  const cost = expansionBudget(
    claims,
    overclaims,
    data?.balance ?? null,
    reserve,
  );
  const pointKey = (x: number, z: number) => x + "," + z;
  function fitArea(value: TownSuggestionsData) {
    const points = [...value.chunks, ...value.cells.map((c) => [c.x, c.z])];
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    setFocus([(minX + maxX + 1) / 2, (minZ + maxZ + 1) / 2]);
    setRange(Math.max(16, Math.max(maxX - minX, maxZ - minZ) + 6));
  }
  function toggle(x: number, z: number) {
    const id = pointKey(x, z);
    const next = selected.includes(id)
      ? selected.filter((k) => k !== id)
      : [...selected, id];
    const connected = connectedClaimSelection(data?.chunks || [], next);
    setSelected(connected);
    setClaims(connected.length);
  }
  const recommendation =
    data &&
    data.capacity !== null &&
    data.capacity > 0 &&
    directions[0].count > 0
      ? directions[0]
      : null;
  const limitExceeded =
    data?.capacity !== null &&
    data?.capacity !== undefined &&
    claims + overclaims > data.capacity;
  return (
    <div className="town-suggestions">
      <header className="page-header page-banner">
        <button onClick={onBack}>← Town details</button>
        <h1>
          Suggestions <span className="badge">Beta</span>
        </h1>
      </header>
      {initialRoute&&<p className="card" role="status" style={{padding:"14px 18px"}}>Rhōmaíōn route preview. Only chunks that are still verified free and connected are selected. Review the route and gold estimate before claiming in Minecraft.</p>}
      <section className="card suggestions-warning" role="note">
        <strong>Beta — not 100% accurate</strong>
        <p>
          Suggestions can make mistakes. EarthMC data and claiming rules may
          change. Check ownership, claim limits, shields, diplomacy and costs in
          Minecraft before spending gold.
        </p>
      </section>
      {loading ? (
        <section className="card" role="status">
          Checking EarthMC town claims and border chunks…
        </section>
      ) : error ? (
        <section className="card" role="alert">
          <p>{error}</p>
          <button onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </section>
      ) : (
        data && (
          <>
            <section className="card suggestions-summary">
              <div>
                <h2>{data.name}</h2>
                <p>
                  {recommendation
                    ? "Consider expanding " +
                      recommendation.name.toLowerCase() +
                      ": " +
                      recommendation.count +
                      " connected chunks are reported as wilderness."
                    : data.capacity === 0
                      ? "Your town has no remaining claim allowance."
                      : "No direction can currently be recommended from the scanned data."}
                </p>
                <p>
                  Ranks use available border space, not terrain quality. All
                  suggested wilderness chunks touch an existing town claim.
                </p>
              </div>
              <div>
                <strong>{data.capacity ?? "Unknown"}</strong>
                <span>Remaining claim allowance</span>
                <strong>
                  {data.balance?.toLocaleString() ?? "Unknown"} gold
                </strong>
                <span>Town bank</span>
              </div>
            </section>
            <section className="card">
              <div className="suggestions-section-heading">
                <h2>Border map</h2>
                <div>
                  <button
                    onClick={() => setRange((r) => Math.max(8, r / 2))}
                    disabled={range <= 8}
                  >
                    Zoom in
                  </button>
                  <button
                    onClick={() => setRange((r) => Math.min(2048, r * 2))}
                    disabled={range >= 2048}
                  >
                    Zoom out
                  </button>
                  <button onClick={() => fitArea(data)}>Fit area</button>
                  <button onClick={() => setFocus(data.home)}>Homeblock</button>
                </div>
              </div>
              {data.cells.some((c) => c.state === "unknown") && (
                <p role="status">
                  <strong>Partial scan:</strong> EarthMC could not verify some
                  border chunks. Grey chunks are excluded from recommendations.
                  Try again shortly for a more complete result.
                </p>
              )}
              <p>
                The map covers up to 10 chunks beyond your town in every
                direction. Click green chunks to build a connected expansion
                route and cost estimate. Coordinates are chunk X/Z; north is up.
                Orange chunks are potential overclaims and require separate
                verification.
              </p>
              <div className="suggestions-map-controls" aria-label="Pan map">
                {[
                  ["North", 0, -1],
                  ["West", -1, 0],
                  ["East", 1, 0],
                  ["South", 0, 1],
                ].map(([label, x, z]) => (
                  <button
                    key={label}
                    onClick={() =>
                      setFocus(([a, b]) => [
                        a + (Number(x) * range) / 3,
                        b + (Number(z) * range) / 3,
                      ])
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <svg
                className="suggestions-map"
                viewBox={
                  focus[0] -
                  range / 2 +
                  " " +
                  (focus[1] - range / 2) +
                  " " +
                  range +
                  " " +
                  range
                }
                role="group"
                aria-label="Town border chunk map"
              >
                {data.chunks
                  .filter(
                    ([x, z]) =>
                      Math.abs(x - focus[0]) <= range / 2 + 1 &&
                      Math.abs(z - focus[1]) <= range / 2 + 1,
                  )
                  .map(([x, z]) => (
                    <rect
                      key={"own" + x + "," + z}
                      x={x}
                      y={z}
                      width=".9"
                      height=".9"
                      className="chunk-own"
                    >
                      <title>
                        Your town · {x}, {z}
                      </title>
                    </rect>
                  ))}
                {data.cells
                  .filter(
                    (c) =>
                      Math.abs(c.x - focus[0]) <= range / 2 + 1 &&
                      Math.abs(c.z - focus[1]) <= range / 2 + 1,
                  )
                  .map((c) => (
                    <rect
                      key={pointKey(c.x, c.z)}
                      x={c.x}
                      y={c.z}
                      width=".9"
                      height=".9"
                      className={
                        "chunk-" +
                        c.state +
                        (selected.includes(pointKey(c.x, c.z))
                          ? " chunk-selected"
                          : "")
                      }
                      role={c.state === "free" ? "button" : undefined}
                      tabIndex={c.state === "free" ? 0 : undefined}
                      aria-label={c.x + ", " + c.z + ": " + c.reason}
                      aria-pressed={
                        c.state === "free"
                          ? selected.includes(pointKey(c.x, c.z))
                          : undefined
                      }
                      onClick={() => c.state === "free" && toggle(c.x, c.z)}
                      onKeyDown={(e) => {
                        if (
                          c.state === "free" &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          toggle(c.x, c.z);
                        }
                      }}
                    >
                      <title>
                        {c.x}, {c.z} · {c.owner || c.state} · {c.reason}
                      </title>
                    </rect>
                  ))}
                {(() => {
                  const groups = new Map<string, { x: number; z: number }[]>();
                  for (const c of data.cells)
                    if (
                      c.owner &&
                      Math.abs(c.x - focus[0]) < range / 2 &&
                      Math.abs(c.z - focus[1]) < range / 2
                    ) {
                      const group = groups.get(c.owner) || [];
                      group.push(c);
                      groups.set(c.owner, group);
                    }
                  groups.set(data.name, [{ x: data.home[0], z: data.home[1] }]);
                  return [...groups].map(([name, points]) => {
                    const cx =
                        points.reduce((n, p) => n + p.x, 0) / points.length,
                      cz = points.reduce((n, p) => n + p.z, 0) / points.length;
                    const anchor = points.reduce((best, p) =>
                      Math.hypot(p.x - cx, p.z - cz) <
                      Math.hypot(best.x - cx, best.z - cz)
                        ? p
                        : best,
                    );
                    return (
                      <text
                        key={name}
                        className="suggestions-town-label"
                        x={anchor.x + 0.5}
                        y={anchor.z - 0.35}
                        textAnchor={
                          anchor.x > focus[0] + range / 4
                            ? "end"
                            : anchor.x < focus[0] - range / 4
                              ? "start"
                              : "middle"
                        }
                        fontSize={range / 35}
                        strokeWidth={range / 190}
                      >
                        <title>{name}</title>
                        {name}
                      </text>
                    );
                  });
                })()}
                <rect
                  x={data.home[0] + 0.15}
                  y={data.home[1] + 0.15}
                  width=".6"
                  height=".6"
                  className="chunk-home"
                >
                  <title>Your homeblock</title>
                </rect>
              </svg>
              <div className="suggestions-legend">
                <span>Your town: blue</span>
                <span>Wilderness: green</span>
                <span>Potential overclaim: orange</span>
                <span>Blocked: red</span>
                <span>Unverified: grey</span>
                <span>Homeblock: white</span>
              </div>
              <p className="muted">
                Assessed {data.scanned} surrounding chunks within{" "}
                {data.scanRadius ?? 1} chunks of your town.{" "}
                {data.coverageLimited
                  ? "This large town reached the scan limit; some surrounding land is not assessed."
                  : "Grey cells could not be verified."}{" "}
                Data checked {new Date(data.checkedAt).toLocaleString()}. Scans
                are cached for up to five minutes.
              </p>
              <button onClick={() => setAttempt((a) => a + 1)}>
                Check again
              </button>
            </section>
            <div className="suggestions-columns">
              <section className="card">
                <h2>Expansion directions</h2>
                {directions.map((d) => (
                  <div className="suggestions-direction" key={d.name}>
                    <strong>{d.name}</strong>
                    <span>
                      {d.count} wilderness chunks · {d.count * 16} gold for all
                    </span>
                  </div>
                ))}
                <p>
                  Routes may need connecting chunks in other directions. Counts
                  describe scanned space, not how many chunks your town can
                  afford or claim.
                </p>
              </section>
              <section className="card">
                <h2>Gold calculator</h2>
                <div className="suggestions-inputs">
                  <label>
                    Wilderness chunks
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="1"
                      value={claims}
                      onChange={(e) => {
                        setSelected([]);
                        setClaims(
                          Math.min(
                            10000,
                            Math.max(
                              0,
                              Math.floor(Number(e.target.value) || 0),
                            ),
                          ),
                        );
                      }}
                    />
                  </label>
                  <label>
                    Overclaim chunks (estimate)
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="1"
                      value={overclaims}
                      onChange={(e) =>
                        setOverclaims(
                          Math.min(
                            24,
                            Math.max(
                              0,
                              Math.floor(Number(e.target.value) || 0),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Keep in bank (gold)
                    <input
                      type="number"
                      min="0"
                      value={reserve}
                      onChange={(e) =>
                        setReserve(Math.max(0, Number(e.target.value) || 0))
                      }
                    />
                  </label>
                </div>
                <p>
                  16 gold per wilderness claim or overclaim. Each chunk is
                  charged once.
                </p>
                <dl className="suggestions-cost">
                  <dt>Total cost</dt>
                  <dd>{cost.total.toLocaleString()} gold</dd>
                  <dt>Additional deposit needed</dt>
                  <dd>
                    {cost.deposit === null
                      ? "Unknown"
                      : cost.deposit.toLocaleString() + " gold"}
                  </dd>
                  <dt>Bank after purchase</dt>
                  <dd>
                    {cost.after === null
                      ? "Unknown"
                      : cost.after.toLocaleString() + " gold"}
                  </dd>
                </dl>
                {limitExceeded && (
                  <p role="alert">
                    This estimate exceeds your town’s remaining claim allowance.
                  </p>
                )}
                {data.capacity === null && (
                  <p>Claim allowance is unknown; verify it in-game.</p>
                )}
                <p>
                  Overclaims are limited to 24 per day. Your usage today is not
                  available here. Entering an estimate does not establish
                  eligibility or select a valid overclaim route.
                </p>
              </section>
            </div>
            <section className="card">
              <h2>Surrounding towns</h2>
              {!data.targets.length ? (
                <p>
                  No surrounding town details were found in the scanned area.
                </p>
              ) : (
                data.targets.map((t) => (
                  <article className="suggestions-target" key={t.uuid}>
                    <h3>{t.name}</h3>
                    <p>
                      {t.surplus ?? "Unknown"} surplus claims · {t.potential}{" "}
                      potential adjacent overclaim chunks
                    </p>
                    <p>{t.reason}</p>
                    {t.potential > 0 && (
                      <p>
                        Upper-bound estimate:{" "}
                        {Math.min(
                          t.potential,
                          t.surplus ?? 0,
                          24,
                          data.capacity ?? 0,
                        )}{" "}
                        chunks ·{" "}
                        {Math.min(
                          t.potential,
                          t.surplus ?? 0,
                          24,
                          data.capacity ?? 0,
                        ) * 16}{" "}
                        gold. Individual chunks may not be claimable together.
                      </p>
                    )}
                  </article>
                ))
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
