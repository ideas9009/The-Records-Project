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
    if (uuid(id)) return id.toLowerCase() === player.uuid.toLowerCase();
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
  const worldTrust = { towns: new Map(), quarters: new Map(), checkedAt: null, running: false, complete: false };
  function refreshWorldTrust() {
    if (worldTrust.running || (worldTrust.checkedAt !== null && now() - worldTrust.checkedAt < 600000)) return;
    worldTrust.running = true;
    void (async () => {
      // One shared scan for all Overview viewers, with room for normal API traffic.
      const [townIds, quarterIds] = await Promise.all([
        towns().then(idsOf),
        query("quarters").then(idsOf),
      ]);
      let complete = true;
      for (const [endpoint, ids, fields] of [
        ["towns", townIds, { uuid: true, name: true, trusted: true, outlaws: true }],
        ["quarters", quarterIds, { uuid: true, name: true, town: true, trusted: true }],
      ]) {
        const next = new Map();
        for (let start = 0; start < ids.length; start += 50) {
          const batch = ids.slice(start, start + 50);
          try {
            const records = await query(endpoint, batch, fields);
            for (const record of records) {
              const id = record?.uuid?.toLowerCase();
              if (batch.includes(id)) next.set(id, record);
            }
          } catch {
            complete = false;
          }
          if (start + 50 < ids.length)
            await new Promise((resolve) => setTimeout(resolve, 850).unref());
        }
        if (next.size !== ids.length) complete = false;
        worldTrust[endpoint] = next;
      }
      worldTrust.complete = complete;
    })().catch(() => {
      worldTrust.complete = false;
    }).finally(() => {
      worldTrust.checkedAt = now();
      worldTrust.running = false;
    });
  }
  async function personalAccess(profile, nation) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(profile.username || "")) return null;
    const players = await query("players", [profile.username], { name: true, uuid: true, town: true });
    const player = players.find((item) => item?.name?.toLowerCase() === profile.username.toLowerCase());
    if (!uuid(player?.uuid)) return null;
    refreshWorldTrust();
    const homeId = uuid(player.town?.uuid) ? player.town.uuid.toLowerCase() : null;
    const nationIds = idsOf(nation.towns);
    const townIds = [...new Set([...nationIds.slice(0, 150), ...(homeId ? [homeId] : [])])];
    const scanned = await scan(townIds, overviewTownBatch);
    const localTowns = list(scanned.records.filter((town) => townIds.includes(town.uuid?.toLowerCase())));
    const records = new Map(scanned.records.filter((town) => uuid(town?.uuid))
      .map((town) => [town.uuid.toLowerCase(), town]));
    const home = records.get(homeId);
    const quarterIds = idsOf(localTowns.flatMap((town) => {
      const quarters = records.get(town.uuid)?.quarters;
      return Array.isArray(quarters) ? quarters : [];
    }));
    const quarters = await scan(quarterIds.slice(0, 200), (ids) =>
      saved("overview-quarters:" + ids.join(","), () =>
        query("quarters", ids, { uuid: true, name: true, town: true, trusted: true }),
      ),
    );
    const allTowns = new Map([...worldTrust.towns, ...records]);
    const allQuarters = new Map(worldTrust.quarters);
    for (const quarter of quarters.records) {
      if (uuid(quarter?.uuid) && quarterIds.includes(quarter.uuid.toLowerCase()))
        allQuarters.set(quarter.uuid.toLowerCase(), quarter);
    }
    return {
      scanning: worldTrust.running,
      homeTown: home?.name || player.town?.name || null,
      homeOutlaws: Array.isArray(home?.outlaws) ? list(home.outlaws) : null,
      trustedTowns: list([...allTowns.values()].filter((town) => hasPlayer(town.trusted, player))),
      outlawedTowns: list([...allTowns.values()].filter((town) => hasPlayer(town.outlaws, player))),
      trustedQuarters: [...allQuarters.values()].filter((quarter) => hasPlayer(quarter.trusted, player)).map((quarter) => ({
        uuid: quarter.uuid.toLowerCase(),
        name: typeof quarter.name === "string" && quarter.name ? quarter.name : "Unnamed quarter",
        town: typeof quarter.town?.name === "string" ? quarter.town.name : null,
      })),
      townsComplete: worldTrust.complete,
      quartersComplete: worldTrust.complete,
    };
  }
  return {
    earthmcOverviewCommunity: async (profile) => {
      allowed(profile);
      const nation = await overviewNation();
      const [online, access] = await Promise.allSettled([
        enemyPresence(nation),
        personalAccess(profile, nation),
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
