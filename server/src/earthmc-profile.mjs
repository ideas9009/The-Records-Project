import { ApiError } from "./security.mjs";
const clean = (value) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/\u00a7[0-9a-fk-or]/gi, "")
        .trim()
        .slice(0, 500)
    : null;
const date = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value < 8640000000000000
    ? new Date(value).toISOString()
    : null;
const ranks = (value) =>
  Array.isArray(value) ? value.slice(0, 30).map(clean).filter(Boolean) : [];
export function createEarthMcProfile({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    pending = new Map();
  return async (name) => {
    if (typeof name !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(name))
      throw new ApiError(400, "Invalid Minecraft username.");
    const key = name.toLowerCase(),
      saved = cache.get(key);
    if (saved && saved.expires > now()) return saved.data;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 6)
      throw new ApiError(503, "EarthMC is busy. Please try again shortly.");
    const request = (async () => {
      let response, items;
      try {
        response = await fetchImpl("https://api.earthmc.net/v4/players", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: [name] }),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if (!response.ok) throw Error();
        items = await response.json();
        if (!Array.isArray(items)) throw Error();
      } catch {
        throw new ApiError(
          503,
          "EarthMC information is temporarily unavailable.",
        );
      }
      const player = items.find(
        (item) =>
          typeof item?.name === "string" && item.name.toLowerCase() === key,
      );
      const data = player
        ? {
            available: true,
            username: clean(player.name),
            town: clean(player.town?.name),
            nation: clean(player.nation?.name),
            about: clean(player.about),
            title: clean(player.title),
            townRanks: ranks(player.ranks?.townRanks),
            nationRanks: ranks(player.ranks?.nationRanks),
            balance:
              typeof player.stats?.balance === "number" &&
              Number.isFinite(player.stats.balance) &&
              player.stats.balance >= 0
                ? player.stats.balance
                : null,
            online:
              typeof player.status?.isOnline === "boolean"
                ? player.status.isOnline
                : null,
            isMayor: player.status?.isMayor === true,
            isKing: player.status?.isKing === true,
            joinedAt: date(player.timestamps?.registered),
            joinedTownAt: date(player.timestamps?.joinedTownAt),
            lastOnline: date(player.timestamps?.lastOnline),
            checkedAt: new Date(now()).toISOString(),
          }
        : { available: false, checkedAt: new Date(now()).toISOString() };
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + 60000 });
      return data;
    })();
    pending.set(key, request);
    try {
      return await request;
    } finally {
      pending.delete(key);
    }
  };
}
