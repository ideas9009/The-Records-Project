import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTowns } from "../lib/cloud-towns";
import { useAuth } from "../lib/auth-context";
import { apiRequest, watchResource } from "../lib/api";
import type { Citizen } from "../lib/citizens";
import { useVoteParty } from "../lib/voteparty";
import {
  finiteStat,
  type OverviewData,
  rankTowns,
  votePercent,
  type ChartTown,
  type Named,
} from "../lib/overview";
import { SyncStatus } from "../components/SmartSync";
import "./Overview.css";
const number = (value: unknown) => {
  const n = finiteStat(value);
  return n === null
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const colors = [
  "#63adff",
  "#ff786b",
  "#79d69c",
  "#ffcb72",
  "#c99cff",
  "#56d8d0",
  "#ff82b2",
];
function Icon({ name }: { name: string }) {
  return (
    <span className="material-symbol" aria-hidden="true">
      {name}
    </span>
  );
}
function Tile({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <section
      className="card overview-tile"
      style={{ "--tile-color": color } as CSSProperties}
    >
      <h2>
        <Icon name={icon} />
        {title}
      </h2>
      {children}
    </section>
  );
}
function Comparison({
  a,
  b,
  labelA = "TRP",
  labelB = "EarthMC",
}: {
  a: unknown;
  b: unknown;
  labelA?: string;
  labelB?: string;
}) {
  return (
    <dl className="overview-comparison">
      <div>
        <dt>{labelA}</dt>
        <dd>{number(a)}</dd>
      </div>
      <div>
        <dt>{labelB}</dt>
        <dd>{number(b)}</dd>
      </div>
    </dl>
  );
}
function Names({
  items,
  onOpen,
  empty,
}: {
  items: Named[] | undefined;
  onOpen?: (id: string) => void;
  empty: string;
}) {
  return items === undefined ? (
    <p className="overview-muted">Unavailable</p>
  ) : items.length ? (
    <ul className="overview-names">
      {items.map((item) => (
        <li key={item.uuid || item.name}>
          {onOpen && item.uuid ? (
            <button onClick={() => onOpen(item.uuid!)}>{item.name}</button>
          ) : (
            item.name
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p className="overview-muted">{empty}</p>
  );
}
function Bars({
  towns,
  metric,
  large = false,
}: {
  towns: ChartTown[];
  metric: "population" | "balance";
  large?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const tooltipId = useId();
  const sorted = rankTowns(towns, metric),
    max = Math.max(1, ...sorted.map((t) => t[metric]!));
  if (!sorted.length)
    return (
      <p className="overview-muted">Town statistics are not available yet.</p>
    );
  const active = activeIndex === null ? null : sorted[activeIndex];
  return (
    <div className="overview-plot" onPointerLeave={() => setActiveIndex(null)}>
      <svg
        className={large ? "overview-bars large" : "overview-bars"}
        viewBox="0 0 1000 280"
        preserveAspectRatio="none"
        role={large ? "group" : "img"}
        aria-label={
          (metric === "balance"
            ? "Town bank balances in Gold"
            : "Town population") +
          ", sorted highest first. " +
          (large
            ? "Exact values are in the table below."
            : "Expand for town names and exact values.")
        }
      >
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="0"
            x2="1000"
            y1={20 + i * 80}
            y2={20 + i * 80}
            stroke="currentColor"
            opacity=".1"
          />
        ))}
        {sorted.map((t, i) => {
          const width = 1000 / sorted.length,
            height = (t[metric]! / max) * 240;
          return (
            <g
              key={t.uuid || t.name}
              tabIndex={large ? 0 : undefined}
              role={large ? "img" : undefined}
              aria-label={
                large
                  ? t.name +
                    ": " +
                    number(t.population) +
                    " residents, " +
                    number(t.balance) +
                    " Gold"
                  : undefined
              }
              aria-describedby={
                large && activeIndex === i ? tooltipId : undefined
              }
              onPointerEnter={() => large && setActiveIndex(i)}
              onPointerDown={() => large && setActiveIndex(i)}
              onFocus={() => large && setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && activeIndex !== null) {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveIndex(null);
                }
                if (
                  large &&
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? sorted.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              sorted.length - 1,
                              i + (e.key === "ArrowRight" ? 1 : -1),
                            ),
                          );
                  const bars =
                    e.currentTarget.parentElement?.querySelectorAll<SVGElement>(
                      "g[tabindex]",
                    );
                  bars?.[next]?.focus();
                }
              }}
            >
              <rect
                className="overview-bar"
                x={i * width + width * 0.13}
                width={Math.max(0.5, width * 0.74)}
                y={270 - height}
                height={Math.max(height, 1)}
                rx="2"
                fill={colors[i % colors.length]}
                stroke={large && activeIndex === i ? "var(--text)" : "none"}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {large ? (
                <rect
                  x={i * width}
                  y="0"
                  width={width}
                  height="280"
                  fill="transparent"
                />
              ) : (
                <title>
                  {t.name +
                    ": " +
                    number(t[metric]) +
                    (metric === "balance" ? " Gold" : " residents")}
                </title>
              )}
            </g>
          );
        })}
      </svg>
      {large && active && (
        <div
          className="overview-bar-tooltip"
          id={tooltipId}
          role="tooltip"
          style={{
            left:
              "clamp(0px, " +
              ((activeIndex! + 0.5) / sorted.length) * 100 +
              "%, max(0px, calc(100% - 230px)))",
          }}
        >
          <strong>{active.name}</strong>
          <dl>
            <div data-emphasized={metric === "population"}>
              <dt>Population</dt>
              <dd>{number(active.population)} residents</dd>
            </div>
            <div data-emphasized={metric === "balance"}>
              <dt>Bank balance</dt>
              <dd>{number(active.balance)} Gold</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
function ExpandedChart({
  metric,
  towns,
  onClose,
}: {
  metric: "population" | "balance";
  towns: ChartTown[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [search, setSearch] = useState("");
  const title = metric === "balance" ? "Town Bank Balances" : "Town Population";
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="overview-chart-dialog"
      aria-labelledby="overview-chart-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <p>BYZANTIUM · EARTHMC</p>
          <h2 id="overview-chart-title">{title}</h2>
        </div>
        <button autoFocus aria-label="Close chart" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="overview-chart-content">
        <Bars towns={towns} metric={metric} large />
        <div className="overview-chart-table">
          <label>
            Find a town
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search towns"
            />
          </label>
          <table>
            <thead>
              <tr>
                <th scope="col">Town</th>
                <th scope="col">
                  {metric === "balance" ? "Bank balance (Gold)" : "Residents"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rankTowns(towns, metric)
                .filter((t) =>
                  t.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((t) => (
                  <tr key={t.uuid || t.name}>
                    <th scope="row">{t.name}</th>
                    <td>{number(t[metric])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}
export default function Overview({ go }: { go: (page: string) => void }) {
  const { account } = useAuth(),
    { towns, loading: townLoading, error: townError } = useTowns();
  const [citizens, setCitizens] = useState<Citizen[] | null>(null),
    [citizenError, setCitizenError] = useState("");
  const [data, setData] = useState<OverviewData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [friends, setFriends] = useState<Named[] | undefined>(),
    [friendError, setFriendError] = useState("");
  const [chart, setChart] = useState<"population" | "balance" | null>(null);
  const vote = useVoteParty(false, attempt);
  useEffect(
    () =>
      watchResource<Citizen[]>(
        "/api/citizens",
        (items) => {
          setCitizens(items);
          setCitizenError("");
        },
        (e) => setCitizenError(e.message),
      ),
    [],
  );
  useEffect(() => {
    setLoading(true);
    return watchResource<OverviewData>(
      "/api/overview",
      (value) => {
        setData(value);
        setError("");
        setLoading(false);
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [attempt]);
  useEffect(() => {
    let active = true;
    setFriends(undefined);
    setFriendError("");
    if (account?.username)
      void apiRequest<{ friends: Named[] | null }>("/api/overview/friends")
        .then((value) => {
          if (active) setFriends(value.friends ?? undefined);
        })
        .catch((e) => {
          if (active) setFriendError(e.message);
        });
    return () => {
      active = false;
    };
  }, [account?.username, attempt]);
  const nation = data?.nation,
    realTowns = towns.filter((t) => !t.testData && t.id !== "test-town"),
    knownChunks = realTowns.filter((t) => t.claimedChunks !== null),
    chunks = knownChunks.reduce((s, t) => s + (t.claimedChunks || 0), 0);
  const percent = votePercent(vote.remaining, vote.target);
  return (
    <div className="overview-page">
      <div className="overview-summary">
        <Tile title="Towns" icon="location_city" color="#82b3ff">
          <button
            className="overview-tile-refresh"
            disabled={loading}
            onClick={() => setAttempt((x) => x + 1)}
            aria-label="Refresh Overview"
            title="Refresh Overview"
          >
            <Icon name="refresh" />
          </button>
          {error && (
            <small role="status">
              EarthMC could not refresh.{" "}
              {data
                ? "Last received figures shown."
                : "Try refreshing shortly."}
            </small>
          )}
          {townError && (
            <small role="status">TRP town counts are unavailable.</small>
          )}

          <SyncStatus path="/api/overview" />
          <Comparison
            a={townLoading || townError ? null : realTowns.length}
            b={nation?.stats?.numTowns}
          />
        </Tile>
        <Tile title="Claimed chunks" icon="map" color="#81dfb0">
          <Comparison
            a={
              townLoading ||
              townError ||
              knownChunks.length !== realTowns.length
                ? null
                : chunks
            }
            b={nation?.stats?.numTownBlocks}
            labelA="TRP towns"
          />
          <small>EarthMC claims belonging to registered towns.</small>
        </Tile>
        <Tile title="Residents" icon="groups" color="#ffd08a">
          {citizenError && (
            <small role="status">TRP resident count is unavailable.</small>
          )}
          <Comparison a={citizens?.length} b={nation?.stats?.numResidents} />
        </Tile>
        <Tile title="King" icon="person" color="#d8a3ff">
          <strong className="overview-value">
            {nation?.king?.name || "—"}
          </strong>
        </Tile>
        <Tile title="Capital" icon="account_balance" color="#ff97b8">
          <strong className="overview-value">
            {nation?.capital?.name || "—"}
          </strong>
        </Tile>
        <Tile title="Nation balance" icon="paid" color="#ffe382">
          <strong className="overview-value">
            {number(nation?.stats?.balance)} <small>Gold</small>
          </strong>
        </Tile>
      </div>
      <p className="overview-caption">
        TRP counts registered records. EarthMC counts the whole nation. Test
        towns are excluded.
      </p>
      <div className="overview-secondary">
        <Tile title="Allies" icon="shield" color="#8ad6ff">
          <Names
            items={nation?.allies ?? undefined}
            empty="No allies listed."
          />
        </Tile>
        <Tile title="Enemies" icon="swords" color="#ff9c91">
          <Names
            items={nation?.enemies ?? undefined}
            empty="No enemies listed."
          />
        </Tile>
        <Tile title="VoteParty" icon="celebration" color="#dca5ff">
          <div className="overview-vote">
            <div>
              <strong className="overview-value">
                {number(vote.remaining)}
              </strong>
              <p>votes remaining</p>
              {vote.target !== null && (
                <small>Target: {number(vote.target)} votes</small>
              )}
            </div>
            <div
              className="overview-ring"
              style={{ "--progress": (percent ?? 0) + "%" } as CSSProperties}
              role="img"
              aria-label={
                percent === null
                  ? "VoteParty progress unavailable"
                  : percent + "% of votes collected"
              }
            >
              <span>{percent === null ? "—" : percent + "%"}</span>
            </div>
          </div>
          {vote.error && (
            <p className="overview-muted" role="status">
              VoteParty could not refresh.{" "}
              {vote.remaining !== null
                ? "Last received count shown."
                : "Try again shortly."}
            </p>
          )}
        </Tile>
      </div>
      <div className="overview-details">
        <Tile title="Nation status" icon="public" color="#8ad6ff">
          <div className="overview-status-pills">
            {nation?.status?.isOpen !== undefined && (
              <span>
                {nation.status.isOpen ? "Open to towns" : "By invitation"}
              </span>
            )}
            {nation?.status?.isNeutral !== undefined && (
              <span>{nation.status.isNeutral ? "Neutral" : "Non-neutral"}</span>
            )}
          </div>
          <p>
            {nation?.board ||
              (!nation
                ? "Waiting for EarthMC nation information."
                : "Current nation settings from EarthMC.")}
          </p>
        </Tile>
        <Tile title="My EarthMC friends" icon="group" color="#8ad6ff">
          {friendError ? (
            <p className="overview-muted">{friendError}</p>
          ) : (
            <Names
              items={friends}
              empty="No friends listed on EarthMC."
              onOpen={(id) => go("earthmc-player:" + id)}
            />
          )}
        </Tile>
      </div>
      <div className="overview-charts">
        {(["population", "balance"] as const).map((metric) => (
          <section className="card overview-chart" key={metric}>
            <button
              className="overview-chart-trigger"
              onClick={() => setChart(metric)}
              aria-haspopup="dialog"
            >
              <h2>
                <Icon
                  name={
                    metric === "population" ? "bar_chart" : "account_balance"
                  }
                />
                {metric === "population"
                  ? "Town Population"
                  : "Town Bank Balances"}
              </h2>
              <span>
                <Icon name="open_in_full" />
                Expand
              </span>
            </button>
            <div onClick={() => setChart(metric)}>
              <Bars towns={data?.towns || []} metric={metric} />
            </div>
          </section>
        ))}
      </div>
      {data?.chartError && (
        <p className="overview-warning" role="status">
          {data.chartError}
        </p>
      )}
      {chart && (
        <ExpandedChart
          metric={chart}
          towns={data?.towns || []}
          onClose={() => setChart(null)}
        />
      )}
    </div>
  );
}
