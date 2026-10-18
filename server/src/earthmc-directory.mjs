import { ApiError } from "./security.mjs";
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const list = (items) => {
  if (!Array.isArray(items))
    throw new ApiError(503, "EarthMC returned an invalid response.");
  return items
    .filter((item) => uuid(item?.uuid) && typeof item?.name === "string")
    .map(({ uuid, name }) => ({
      uuid: uuid.toLowerCase(),
      name: name.slice(0, 100),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
export function createEarthMcDirectory({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    pending = new Map();
  let windowStart = now(),
    requests = 0;
  async function query(endpoint, ids) {
    if (now() - windowStart >= 60000) {
      windowStart = now();
      requests = 0;
    }
    if (++requests > 150)
      throw new ApiError(503, "EarthMC is busy. Please try again shortly.");
    try {
      const response = await fetchImpl(
        "https://api.earthmc.net/v4/" + endpoint,
        {
          method: ids ? "POST" : "GET",
          ...(ids
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: ids }),
              }
            : {}),
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        },
      );
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!Array.isArray(data)) throw Error();
      return data;
    } catch {
      throw new ApiError(
        503,
        "EarthMC is temporarily unavailable. Please try again.",
      );
    }
  }
  async function saved(key, load) {
    const old = cache.get(key);
    if (old && old.expires > now()) return old.data;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 6)
      throw new ApiError(503, "EarthMC is busy. Please try again shortly.");
    const job = load().then((data) => {
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + 60000 });
      return data;
    });
    pending.set(key, job);
    try {
      return await job;
    } finally {
      pending.delete(key);
    }
  }
  const players = () =>
    saved("players", async () => list(await query("players")));
  const nations = () =>
    saved("nations", async () => list(await query("nations")));
  const allowed = (profile) => {
    if (
      profile?.authType !== "records" ||
      profile.nation !== "byzantium" ||
      !["pending", "approved"].includes(profile.status)
    )
      throw new ApiError(403, "EarthMC directory access is unavailable.");
  };
  return {
    earthmcDirectory: async (profile) => {
      allowed(profile);
      const [people, countries] = await Promise.all([players(), nations()]);
      return {
        players: people,
        nations: countries,
        checkedAt: new Date(now()).toISOString(),
      };
    },
    earthmcNationPlayers: async (profile, id) => {
      allowed(profile);
      if (!uuid(id)) throw new ApiError(400, "Invalid nation.");
      return saved("nation:" + id.toLowerCase(), async () => {
        const [people, items] = await Promise.all([
          players(),
          query("nations", [id]),
        ]);
        const nation = items.find(
          (item) => item?.uuid?.toLowerCase() === id.toLowerCase(),
        );
        if (!nation) throw new ApiError(404, "Nation not found.");
        if (!Array.isArray(nation.residents))
          throw new ApiError(503, "EarthMC nation residents are unavailable.");
        const members = new Set(
          nation.residents
            .filter((item) => uuid(item?.uuid))
            .map((item) => item.uuid.toLowerCase()),
        );
        return {
          players: people.filter((player) => members.has(player.uuid)),
          checkedAt: new Date(now()).toISOString(),
        };
      });
    },
    earthmcPlayer: async (profile, id) => {
      allowed(profile);
      if (!uuid(id)) throw new ApiError(400, "Invalid player.");
      return saved("player:" + id.toLowerCase(), async () => {
        const items = await query("players", [id]),
          player = items.find(
            (item) => item?.uuid?.toLowerCase() === id.toLowerCase(),
          );
        if (!player)
          throw new ApiError(
            404,
            "This EarthMC player is unavailable or has opted out of the API.",
          );
        return { player, checkedAt: new Date(now()).toISOString() };
      });
    },
  };
}
