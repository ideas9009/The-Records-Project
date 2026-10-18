import MinecraftFace from "./MinecraftFace";
const text = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/\u00a7[0-9a-fk-or]/gi, "")
        .trim()
    : "";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const date = (value: unknown) =>
  typeof value === "number" && value > 0 && value < 8640000000000000
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unavailable";
export default function EarthMcProfileSummary({
  player,
  onOpen,
}: {
  player: Record<string, unknown>;
  onOpen: (id: string) => void;
}) {
  const status = object(player.status),
    stats = object(player.stats),
    times = object(player.timestamps),
    ranks = object(player.ranks);
  const rankNames = [
    ...(status.isKing === true ? ["King"] : []),
    ...(status.isMayor === true ? ["Mayor"] : []),
    ...[ranks.nationRanks, ranks.townRanks].flatMap((value) =>
      Array.isArray(value) ? value.map(text).filter(Boolean) : [],
    ),
  ];
  const facts = {
    Town: text(object(player.town).name) || "No town",
    Nation: text(object(player.nation).name) || "No nation",
    "Bank balance":
      typeof stats.balance === "number" && Number.isFinite(stats.balance)
        ? stats.balance.toLocaleString() + " Gold"
        : "Unavailable",
    "Joined EarthMC": date(times.registered),
    "Joined town": date(times.joinedTownAt),
    "Last online":
      status.isOnline === true ? "Online now" : date(times.lastOnline),
  };
  const friends = Array.isArray(player.friends)
    ? player.friends.map(object)
    : [];
  return (
    <>
      <section className="card earthmc-overview">
        <div className="earthmc-profile-heading">
          <h2>Player overview</h2>
          <span
            className={
              "earthmc-presence " +
              (status.isOnline === true ? "is-online" : "")
            }
          >
            {status.isOnline === true
              ? "Online"
              : status.isOnline === false
                ? "Offline"
                : "Status unavailable"}
          </span>
        </div>
        {text(player.formattedName) &&
          text(player.formattedName) !== text(player.name) && (
            <p className="earthmc-display-name">{text(player.formattedName)}</p>
          )}
        {!!rankNames.length && (
          <div className="citizen-roles" aria-label="EarthMC ranks">
            {[...new Set(rankNames)].map((rank) => (
              <span className="citizen-role" key={rank}>
                {rank}
              </span>
            ))}
          </div>
        )}
        {text(player.about) && (
          <p className="earthmc-about">{text(player.about)}</p>
        )}
        <dl className="citizen-facts earthmc-facts">
          {Object.entries(facts).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card earthmc-friends-section">
        <h2>
          Friends{" "}
          <span className="citizens-muted">
            ({friends.length.toLocaleString()})
          </span>
        </h2>
        {friends.length ? (
          <div className="earthmc-friend-grid">
            {friends.map((friend, index) => {
              const name = text(friend.name) || "Unknown player",
                id = text(friend.uuid),
                valid =
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    id,
                  );
              return (
                <button
                  key={id || index}
                  disabled={!valid}
                  onClick={() => onOpen(id)}
                >
                  <MinecraftFace username={name} uuid={id} />
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="citizens-muted">No public friends listed.</p>
        )}
      </section>
    </>
  );
}
