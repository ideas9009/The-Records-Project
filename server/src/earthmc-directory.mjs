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
      if (endpoint === "online") {
        if (
          !data ||
          !Array.isArray(data.players) ||
          !Number.isFinite(data.count)
        )
          throw Error();
        return data.players;
      }
      if (!Array.isArray(data)) throw Error();
      return data;
    } catch {
      throw new ApiError(
        503,
        "EarthMC is temporarily unavailable. Please try again.",
      );
    }
  }
  async function saved(key, load, ttl = 60000) {
    const old = cache.get(key);
    if (old && old.expires > now()) return old.data;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 6)
      throw new ApiError(503, "EarthMC is busy. Please try again shortly.");
    const job = load().then((data) => {
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + ttl });
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
  const towns = () => saved("towns", async () => list(await query("towns")));
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
  const townDetail = (id) =>
    saved("town:" + id.toLowerCase(), async () => {
      const items = await query("towns", [id]);
      const town = items.find(
        (item) => item?.uuid?.toLowerCase() === id.toLowerCase(),
      );
      if (!town) throw new ApiError(404, "This EarthMC town is unavailable.");
      return { town, checkedAt: new Date(now()).toISOString() };
    });
  return {
    earthmcOverview: async (profile) => {
      allowed(profile);
      return saved("overview", async () => {
        const matches = await query("nations", ["Byzantium"]);
        const item = matches.find(
          (n) => n?.name?.toLowerCase() === "byzantium",
        );
        if (!item)
          throw new ApiError(
            503,
            "Byzantium is currently unavailable on EarthMC.",
          );
        const valid = (n) =>
          typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
        const nation = {
          name: item.name,
          king: item.king,
          capital: item.capital,
          board:
            typeof item.board === "string" ? item.board.slice(0, 1000) : null,
          status: {
            isOpen: item.status?.isOpen,
            isNeutral: item.status?.isNeutral,
          },
          stats: Object.fromEntries(
            ["numTowns", "numResidents", "numTownBlocks", "balance"].map(
              (k) => [k, valid(item.stats?.[k])],
            ),
          ),
          allies: Array.isArray(item.allies) ? list(item.allies) : null,
          enemies: Array.isArray(item.enemies) ? list(item.enemies) : null,
        };
        const names = Array.isArray(item.towns)
          ? item.towns.slice(0, 2000)
          : [];
        const towns = [];
        let chartError = "";
        try {
          for (let start = 0; start < names.length; start += 50) {
            const batch = await query(
              "towns",
              names.slice(start, start + 50).map((t) => t.uuid || t.name),
            );
            for (const town of batch)
              if (
                town.nation?.name?.toLowerCase() === "byzantium" &&
                typeof town.name === "string"
              )
                towns.push({
                  name: town.name,
                  uuid: town.uuid,
                  population: valid(town.stats?.numResidents),
                  balance: valid(town.stats?.balance),
                });
          }
          if (towns.length < names.length)
            chartError =
              "Some towns did not return statistics. Charts include the available towns.";
        } catch {
          chartError =
            "Some town statistics could not be loaded. Refresh to try again.";
        }
        return {
          nation,
          towns,
          chartError,
          checkedAt: new Date(now()).toISOString(),
        };
      });
    },
    earthmcFriends: async (profile) => {
      allowed(profile);
      if (!/^[A-Za-z0-9_]{3,16}$/.test(profile.username || ""))
        throw new ApiError(400, "Invalid Minecraft username.");
      return saved("friends:" + profile.username.toLowerCase(), async () => {
        const items = await query("players", [profile.username]);
        const player = items.find(
          (p) => p?.name?.toLowerCase() === profile.username.toLowerCase(),
        );
        if (!player)
          throw new ApiError(
            404,
            "This username has no public EarthMC profile.",
          );
        return {
          friends: Array.isArray(player.friends) ? list(player.friends) : null,
        };
      });
    },
    earthmcOnline: async (profile) => {
      allowed(profile);
      return saved(
        "online",
        async () => ({
          players: list(await query("online")),
          checkedAt: new Date(now()).toISOString(),
        }),
        20000,
      );
    },
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
    earthmcTownDirectory: async (profile) => {
      allowed(profile);
      const [places, countries] = await Promise.all([towns(), nations()]);
      return {
        towns: places,
        nations: countries,
        checkedAt: new Date(now()).toISOString(),
      };
    },
    earthmcNationTowns: async (profile, id) => {
      allowed(profile);
      if (!uuid(id)) throw new ApiError(400, "Invalid nation.");
      return saved("nation-towns:" + id.toLowerCase(), async () => {
        const [places, items] = await Promise.all([
          towns(),
          query("nations", [id]),
        ]);
        const nation = items.find(
          (item) => item?.uuid?.toLowerCase() === id.toLowerCase(),
        );
        if (!nation) throw new ApiError(404, "Nation not found.");
        if (!Array.isArray(nation.towns))
          throw new ApiError(503, "EarthMC nation towns are unavailable.");
        const members = new Set(
          nation.towns
            .filter((item) => uuid(item?.uuid))
            .map((item) => item.uuid.toLowerCase()),
        );
        return {
          towns: places.filter((town) => members.has(town.uuid)),
          checkedAt: new Date(now()).toISOString(),
        };
      });
    },
    earthmcTown: async (profile, id) => {
      allowed(profile);
      if (!uuid(id)) throw new ApiError(400, "Invalid town.");
      return townDetail(id);
    },
    earthmcTownQuarter: async (profile, townId, quarterId) => {
      allowed(profile);
      if (!uuid(townId) || !uuid(quarterId))
        throw new ApiError(400, "Invalid town or apartment.");
      const { town } = await townDetail(townId);
      const belongs =
        Array.isArray(town.quarters) &&
        town.quarters.some((item) => {
          const id = typeof item === "string" ? item : item?.uuid;
          return uuid(id) && id.toLowerCase() === quarterId.toLowerCase();
        });
      if (!belongs)
        throw new ApiError(404, "This apartment is not listed in this town.");
      return saved(
        "quarter:" + townId.toLowerCase() + ":" + quarterId.toLowerCase(),
        async () => {
          const items = await query("quarters", [quarterId]);
          const quarter = items.find(
            (item) => item?.uuid?.toLowerCase() === quarterId.toLowerCase(),
          );
          if (
            !quarter ||
            quarter.town?.uuid?.toLowerCase() !== townId.toLowerCase()
          )
            throw new ApiError(
              404,
              "This apartment is unavailable in this town.",
            );
          return { quarter, checkedAt: new Date(now()).toISOString() };
        },
      );
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
