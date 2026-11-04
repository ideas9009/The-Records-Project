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
  async function query(endpoint, ids, template) {
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
                body: JSON.stringify({ query: ids, ...(template && { template }) }),
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
  const overviewNation = () => saved("overview-nation", async () => {
    const matches = await query("nations", ["Byzantium"]);
    const nation = matches.find((item) => item?.name?.toLowerCase() === "byzantium");
    if (!nation) throw new ApiError(503, "Byzantium is currently unavailable on EarthMC.");
    return nation;
  });
  const overviewTownBatch = (ids) => saved("overview-towns:" + ids.join(","), () =>
    query("towns", ids, { uuid: true, name: true, nation: true, stats: true, trusted: true, outlaws: true, quarters: true }),
  );
  const onlinePlayers = () => saved("online", async () => ({
    players: list(await query("online")),
    checkedAt: new Date(now()).toISOString(),
  }), 20000);
  const idsOf = (items) => [...new Set((Array.isArray(items) ? items : [])
    .map((item) => typeof item === "string" ? item : item?.uuid)
    .filter(uuid)
    .map((id) => id.toLowerCase()))];
  const hasPlayer = (items, player) => Array.isArray(items) && items.some((item) => {
    const id = typeof item === "string" ? item : item?.uuid;
    const playerId = typeof player.uuid === "string" ? player.uuid.replaceAll("-", "").toLowerCase() : null;
    if (uuid(id) && playerId) return id.replaceAll("-", "").toLowerCase() === playerId;
    const name = typeof item === "string" ? item : item?.name;
    return typeof name === "string" && name.toLowerCase() === player.name.toLowerCase();
  });
  async function scan(ids, load) {
    const batches = [];
    for (let start = 0; start < ids.length; start += 50)
      batches.push(load(ids.slice(start, start + 50)));
    const results = await Promise.allSettled(batches);
    const records = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const found = new Set(idsOf(records));
    return { records, complete: ids.every((id) => found.has(id)) };
  }
  async function enemyPresence(nation) {
    if (!Array.isArray(nation.enemies)) return null;
    const allIds = idsOf(nation.enemies);
    if (!allIds.length) return { players: [], complete: nation.enemies.length === 0 };
    const [online, matches] = await Promise.all([
      onlinePlayers(),
      scan(allIds.slice(0, 100), (ids) => saved("enemy-nations:" + ids.join(","), () =>
        query("nations", ids, { uuid: true, name: true, residents: true }),
      )),
    ]);
    const byPlayer = new Map();
    const enemies = new Set(allIds);
    for (const enemy of matches.records) {
      if (!enemies.has(enemy.uuid?.toLowerCase()) || typeof enemy.name !== "string") continue;
      for (const id of idsOf(enemy.residents)) byPlayer.set(id, enemy.name);
    }
    return {
      players: online.players.filter((player) => byPlayer.has(player.uuid))
        .map((player) => ({ ...player, nation: byPlayer.get(player.uuid) })),
      complete: matches.complete && allIds.length <= 100 &&
        matches.records.every((enemy) => Array.isArray(enemy.residents)),
    };
  }
  const trustInterval = 10 * 60 * 1000;
  const worldTrust = {
    towns: { records: new Map(), expected: null, complete: false },
    quarters: { records: new Map(), expected: null, complete: false },
  };
  let scanJob;
  async function collectTrust(endpoint, directory, fields) {
    try {
      const ids = idsOf(await directory());
      if (ids.length === 0) throw Error("EarthMC returned an empty directory.");
      const records = new Map();
      if (worldTrust[endpoint].expected === null)
        worldTrust[endpoint] = { records, expected: ids.length, complete: false };
      for (let start = 0; start < ids.length; start += 50) {
        const batch = ids.slice(start, start + 50);
        try {
          for (const record of await query(endpoint, batch, fields)) {
            const id = record?.uuid?.toLowerCase();
            if (batch.includes(id)) records.set(id, record);
          }
        } catch {
          // Continue with the other batches and expose partial coverage.
        }
        if (start + 50 < ids.length)
          await new Promise((resolve) => setTimeout(resolve, 1000).unref());
      }
      worldTrust[endpoint] = { records, expected: ids.length, complete: records.size === ids.length };
    } catch {
      // Keep the last snapshot if the directory itself fails.
      worldTrust[endpoint] = { ...worldTrust[endpoint], complete: false };
    }
  }
  function refreshWorldTrust() {
    if (scanJob) return scanJob;
    scanJob = (async () => {
      await collectTrust("towns", towns, { uuid: true, name: true, trusted: true, outlaws: true });
      await collectTrust("quarters", () => query("quarters"), { uuid: true, name: true, town: true, trusted: true });
    })().finally(() => { scanJob = undefined; });
    return scanJob;
  }
  function startEarthMcTrustScan() {
    void refreshWorldTrust();
    const timer = setInterval(() => void refreshWorldTrust(), trustInterval);
    timer.unref();
    return () => clearInterval(timer);
  }
  function earthmcTrustScanStatus() {
    const status = ({ records, expected, complete }) => ({
      checked: records.size,
      expected,
      complete,
    });
    return {
      scanning: !!scanJob,
      towns: status(worldTrust.towns),
      quarters: status(worldTrust.quarters),
    };
  }
  async function personalAccess(profile) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(profile.username || "")) return null;
    const players = await query("players", [profile.username], { name: true, uuid: true, town: true })
      .catch(() => []);
    const player = players.find((item) => item?.name?.toLowerCase() === profile.username.toLowerCase());
    const identity = { name: profile.username, uuid: player?.uuid || profile.minecraftUuid };
    const homeId = uuid(player?.town?.uuid) ? player.town.uuid.toLowerCase() : null;
    const home = homeId
      ? worldTrust.towns.records.get(homeId) ??
        (await townDetail(homeId).catch(() => null))?.town
      : null;
    return {
      ...earthmcTrustScanStatus(),
      homeTown: home?.name || player?.town?.name || null,
      homeTownKnown: !!player,
      homeOutlaws: Array.isArray(home?.outlaws) ? list(home.outlaws) : null,
      trustedTowns: list([...worldTrust.towns.records.values()].filter((town) => hasPlayer(town.trusted, identity))),
      outlawedTowns: list([...worldTrust.towns.records.values()].filter((town) => hasPlayer(town.outlaws, identity))),
      trustedQuarters: [...worldTrust.quarters.records.values()]
        .filter((quarter) => hasPlayer(quarter.trusted, identity))
        .map((quarter) => ({
          uuid: quarter.uuid.toLowerCase(),
          name: typeof quarter.name === "string" && quarter.name ? quarter.name : "Unnamed quarter",
          town: typeof quarter.town?.name === "string" ? quarter.town.name : null,
        })),
    };
  }
  return {
    startEarthMcTrustScan,
    refreshWorldTrust,
    earthmcTrustScanStatus,
    earthmcOverviewCommunity: async (profile) => {
      allowed(profile);
      const nation = await overviewNation();
      const [online, access] = await Promise.allSettled([
        enemyPresence(nation),
        personalAccess(profile),
      ]);
      return {
        nationOutlaws: Array.isArray(nation.outlaws) ? list(nation.outlaws) : null,
        onlineEnemies: online.status === "fulfilled" ? online.value : null,
        access: access.status === "fulfilled" ? access.value : null,
      };
    },
    earthmcOverview: async (profile) => {
      allowed(profile);
      return saved("overview", async () => {
        const item = await overviewNation();
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
            const batch = await overviewTownBatch(
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
      return onlinePlayers();
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
    earthmcNation: async (profile,id) => {
      allowed(profile);if(!uuid(id))throw new ApiError(400,'Invalid nation.');
      return saved('nation-detail:'+id.toLowerCase(),async()=>{
        const items=await query('nations',[id]);const nation=items.find(item=>item?.uuid?.toLowerCase()===id.toLowerCase());
        if(!nation)throw new ApiError(404,'This EarthMC nation is unavailable.');
        return {nation,checkedAt:new Date(now()).toISOString()};
      });
    },
    earthmcPlayer: async (profile, id) => {
      allowed(profile);
      if (!uuid(id)) throw new ApiError(400, "Invalid player.");
      // Recheck public player availability on every lookup; never fall back to an old profile.
      return (async () => {
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
      })();
    },
  };
}
