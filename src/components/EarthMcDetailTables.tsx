import type { ReactNode } from "react";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const human = (key: string) =>
  (
    ({
      isOnline: "Online",
      isNPC: "Non-player character (NPC)",
      isMayor: "Mayor",
      isKing: "Nation leader",
      hasTown: "Town member",
      hasNation: "Nation member",
      registered: "Joined EarthMC",
      joinedTownAt: "Joined town",
      lastOnline: "Last online",
      balance: "Bank balance",
      numFriends: "Number of friends",
      numResidents: "Residents",
      numTownBlocks: "Claimed chunks",
      maxTownBlocks: "Maximum chunks",
      claimedAt: "Claimed",
      joinedNationAt: "Joined nation",
      ruinedAt: "Ruined",
      pvp: "Player combat (PvP)",
      explosion: "Explosions",
      fire: "Fire",
      mobs: "Mobs",
      build: "Build",
      destroy: "Destroy",
      switch: "Switch",
      itemUse: "Item use",
      itemuse: "Item use",
    }) as Record<string, string>
  )[key] ||
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
function State({ value, flags = false }: { value: unknown; flags?: boolean }) {
  return (
    <span
      className={
        "earthmc-table-state " +
        (value === true ? "yes" : value === false ? "no" : "unknown")
      }
    >
      {value === true
        ? flags
          ? "Enabled"
          : "Yes"
        : value === false
          ? flags
            ? "Disabled"
            : "No"
          : "Unavailable"}
    </span>
  );
}
export default function EarthMcDetailTables({
  section,
  value,
  render,
  entity = "player",
}: {
  entity?: "player" | "town" | "quarter";
  section: string;
  value: unknown;
  render: (value: unknown, field?: string) => ReactNode;
}) {
  const entries = Object.entries(object(value));
  if (section === "perms") {
    const permissions = entries.filter(([, item]) => Array.isArray(item));
    const count = Math.max(
      4,
      ...permissions.map(([, item]) => (item as unknown[]).length),
    );
    const groups = Array.from(
      { length: count },
      (_, index) =>
        (entity === "town"
          ? ["Residents", "Nation members", "Allies", "Outsiders"]
          : ["Friends", "Town members", "Allies", "Outsiders"])[index] ||
        "Group " + (index + 1),
    );
    const flags = Object.entries(object(object(value).flags));
    return (
      <>
        <p className="citizens-muted">
          {entity === "town"
            ? "Default town permissions for residents, nation members, allies and outsiders."
            : "Default permissions on this player's plots. Allies include fellow nation members and allied nations."}
        </p>
        <div
          className="earthmc-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={
            entity === "town" ? "Town permissions" : "Player plot permissions"
          }
        >
          <table className="earthmc-info-table permission-table">
            <caption>
              {entity === "town"
                ? "Town permissions"
                : "Player plot permissions"}
            </caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                {groups.map((group) => (
                  <th scope="col" key={group}>
                    {group}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map(([key, item]) => (
                <tr key={key}>
                  <th scope="row">{human(key)}</th>
                  {groups.map((group, index) => (
                    <td key={group}>
                      <State value={(item as unknown[])[index]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!!flags.length && (
          <table className="earthmc-info-table">
            <caption>{entity === "town" ? "Town flags" : "Plot flags"}</caption>
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {flags.map(([key, item]) => (
                <tr key={key}>
                  <th scope="row">{human(key)}</th>
                  <td>
                    {typeof item === "boolean" ? (
                      <State value={item} flags />
                    ) : (
                      render(item, key)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {entries
          .filter(([key, item]) => key !== "flags" && !Array.isArray(item))
          .map(([key, item]) => (
            <div key={key}>
              <h3>{human(key)}</h3>
              {render(item, key)}
            </div>
          ))}
      </>
    );
  }
  if (section === "timestamps")
    return (
      <div className="earthmc-table-scroll">
        <table className="earthmc-info-table">
          <caption>
            Dates and times ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          </caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Date</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, item]) => {
              const valid =
                typeof item === "number" &&
                Number.isFinite(item) &&
                item > 0 &&
                item < 8640000000000000;
              const date = valid ? new Date(item) : null;
              return (
                <tr key={key}>
                  <th scope="row">
                    {key === "registered" && entity !== "player"
                      ? entity === "quarter"
                        ? "Apartment created"
                        : "Town founded"
                      : human(key)}
                  </th>
                  <td>
                    {date
                      ? date.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : render(item, key)}
                  </td>
                  <td>
                    {date
                      ? date.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "Unavailable"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  return (
    <table className="earthmc-info-table">
      <thead>
        <tr>
          <th scope="col">{section === "stats" ? "Statistic" : "Detail"}</th>
          <th scope="col">{section === "stats" ? "Value" : "State"}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, item]) => (
          <tr key={key}>
            <th scope="row">{human(key)}</th>
            <td>
              {typeof item === "boolean" ? (
                <State value={item} />
              ) : section === "stats" &&
                key === "balance" &&
                typeof item === "number" ? (
                item.toLocaleString() + " Gold"
              ) : (
                render(item, key)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
