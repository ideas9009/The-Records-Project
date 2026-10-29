import { ApiError, approved } from "./security.mjs";
import { isTownMayor } from "./town-membership.mjs";
const base = "nations/byzantium",
  key = ([x, z]) => x + "," + z;
const validPoint = (p) =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isSafeInteger);
const finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
export function borderChunks(chunks, home, limit = 192) {
  const owned = new Set(chunks.map(key)),
    border = new Map();
  for (const [x, z] of chunks)
    for (const p of [
      [x, z - 1],
      [x + 1, z],
      [x, z + 1],
      [x - 1, z],
    ])
      if (!owned.has(key(p))) border.set(key(p), p);
  const all = [...border.values()].sort(
    (a, b) =>
      Math.abs(a[0] - home[0]) +
        Math.abs(a[1] - home[1]) -
        (Math.abs(b[0] - home[0]) + Math.abs(b[1] - home[1])) ||
      a[0] - b[0] ||
      a[1] - b[1],
  );
  return { points: all.slice(0, limit), total: all.length };
}
function separates(chunks, removed) {
  const remaining = new Set(
    chunks.filter((p) => key(p) !== key(removed)).map(key),
  );
  if (!remaining.size) return true;
  const pending = [[...remaining][0]];
  remaining.delete(pending[0]);
  for (let i = 0; i < pending.length; i++) {
    const [x, z] = pending[i].split(",").map(Number);
    for (const p of [
      [x, z - 1],
      [x + 1, z],
      [x, z + 1],
      [x - 1, z],
    ])
      if (remaining.delete(key(p))) pending.push(key(p));
  }
  return remaining.size > 0;
}
export function overclaimReason(own, other, point, now) {
  if (!other) return "Nearby town details are unavailable.";
  if (
    !finite(own.timestamps?.registered) ||
    now - own.timestamps.registered < 30 * 86400000
  )
    return "Your town must be at least 30 days old; verify its creation date.";
  if (other.status?.hasOverclaimShield !== false)
    return "The target has a shield, or its shield status is unknown.";
  if (other.status?.isOverClaimed !== true)
    return "The target is not reported as overclaimed.";
  if (
    !finite(other.stats?.numTownBlocks) ||
    !finite(other.stats?.maxTownBlocks) ||
    other.stats.numTownBlocks <= 12 ||
    other.stats.numTownBlocks <= other.stats.maxTownBlocks
  )
    return "No eligible surplus claims are reported.";
  if (!validPoint(other.coordinates?.homeBlock))
    return "The protected homeblock could not be verified.";
  if (key(point) === key(other.coordinates.homeBlock))
    return "Protected homeblock.";
  if (own.nation?.uuid && own.nation.uuid === other.nation?.uuid)
    return "Belongs to your own nation.";
  const chunks = other.coordinates?.townBlocks;
  if (
    !Array.isArray(chunks) ||
    !chunks.every(validPoint) ||
    chunks.length !== other.stats.numTownBlocks ||
    chunks.length > 10000
  )
    return "The complete target claim layout could not be verified.";
  if (!chunks.some((p) => key(p) === key(point)))
    return "Ownership data changed; scan again.";
  if (separates(chunks, point))
    return "Removing this chunk could split the target town.";
  return null;
}
export function createTownSuggestions(
  store,
  { fetchImpl = fetch, now = Date.now } = {},
) {
  let requestWindow = now(),
    requests = 0;
  const cache = new Map(),
    pending = new Map();
  async function query(endpoint, items) {
    if (now() - requestWindow >= 60000) {
      requestWindow = now();
      requests = 0;
    }
    if (++requests > 120)
      throw new ApiError(
        429,
        "Scan request limit reached. Try again in a minute.",
      );
    try {
      const response = await fetchImpl(
        "https://api.earthmc.net/v4/" + endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: items }),
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        },
      );
      if (!response.ok) throw Error();
      const value = await response.json();
      if (!Array.isArray(value)) throw Error();
      return value;
    } catch {
      throw new ApiError(
        503,
        "EarthMC could not complete the scan. Please try again later.",
      );
    }
  }
  async function scan(record) {
    const rows = await query("towns", [record.earthmcUuid || record.name]);
    const own = rows.find((t) =>
      record.earthmcUuid
        ? t.uuid?.toLowerCase() === record.earthmcUuid.toLowerCase()
        : t.name?.toLowerCase() === record.name.toLowerCase(),
    );
    if (!own)
      throw new ApiError(404, "This town could not be found on EarthMC.");
    const chunks = own.coordinates?.townBlocks,
      home = own.coordinates?.homeBlock;
    if (
      !Array.isArray(chunks) ||
      !chunks.length ||
      chunks.length > 10000 ||
      !chunks.every(validPoint) ||
      new Set(chunks.map(key)).size !== chunks.length ||
      (finite(own.stats?.numTownBlocks) &&
        chunks.length !== own.stats.numTownBlocks) ||
      !validPoint(home)
    )
      throw new ApiError(
        503,
        "Complete town chunk coordinates are unavailable.",
      );
    if (
      own.coordinates?.spawn?.world &&
      own.coordinates.spawn.world !== "earth"
    )
      throw new ApiError(
        503,
        "This beta currently supports the Earth world only.",
      );
    const border = borderChunks(chunks, home),
      locations = new Map();
    for (let i = 0; i < border.points.length; i += 32) {
      const batch = border.points
        .slice(i, i + 32)
        .map(([x, z]) => [x * 16 + 8, z * 16 + 8]);
      const rows = await query("location", batch);
      for (const item of rows)
        if (
          Number.isSafeInteger(item?.location?.x) &&
          Number.isSafeInteger(item?.location?.z)
        )
          locations.set(
            key([
              Math.floor(item.location.x / 16),
              Math.floor(item.location.z / 16),
            ]),
            item,
          );
    }
    const ids = [
      ...new Set(
        [...locations.values()]
          .map((r) => r.town?.uuid)
          .filter((id) => typeof id === "string" && id !== own.uuid),
      ),
    ].slice(0, 16);
    let neighbours = [];
    if (ids.length) {
      try {
        neighbours = await query("towns", ids);
      } catch {
        /* Unknown targets remain blocked. */
      }
    }
    const cells = border.points.map(([x, z]) => {
      const location = locations.get(key([x, z])),
        other = neighbours.find((t) => t.uuid === location?.town?.uuid);
      let state = "unknown",
        reason = "Ownership could not be verified.";
      if (location?.isWilderness === true && !location.town?.uuid) {
        state = "free";
        reason = "Reported as wilderness beside your existing claims.";
      } else if (location?.town?.uuid) {
        state = "blocked";
        reason = overclaimReason(own, other, [x, z], now());
        if (reason === null) {
          state = "potential";
          reason =
            "Potential overclaim. Verify current eligibility, diplomacy and daily usage in Minecraft.";
        }
      }
      const dx = x - home[0],
        dz = z - home[1],
        direction =
          Math.abs(dx) > Math.abs(dz)
            ? dx > 0
              ? "East"
              : "West"
            : dz > 0
              ? "South"
              : "North";
      return {
        x,
        z,
        state,
        reason,
        direction,
        owner: location?.town?.name || null,
      };
    });
    const targets = neighbours.map((t) => ({
      name: t.name,
      uuid: t.uuid,
      surplus:
        finite(t.stats?.numTownBlocks) && finite(t.stats?.maxTownBlocks)
          ? Math.max(0, t.stats.numTownBlocks - t.stats.maxTownBlocks)
          : null,
      potential: cells.filter(
        (c) => c.owner === t.name && c.state === "potential",
      ).length,
      reason:
        cells.find((c) => c.owner === t.name)?.reason ||
        "No scanned adjacent chunks.",
    }));
    return {
      name: own.name,
      home,
      chunks,
      cells,
      targets,
      balance: finite(own.stats?.balance) ? own.stats.balance : null,
      capacity:
        finite(own.stats?.maxTownBlocks) && finite(own.stats?.numTownBlocks)
          ? Math.max(0, own.stats.maxTownBlocks - own.stats.numTownBlocks)
          : null,
      scanned: cells.length,
      borderTotal: border.total,
      checkedAt: new Date(now()).toISOString(),
      costPerChunk: 16,
    };
  }
  return {
    townSuggestions: async (profile, id) => {
      approved(profile);
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id))
        throw new ApiError(400, "Invalid town.");
      const [actor, record] = await Promise.all([
        store.get("users/" + profile.uid),
        store.get(base + "/towns/" + id),
      ]);
      approved(actor);
      if (!record) throw new ApiError(404, "Town not found.");
      if (!isTownMayor(record, actor.uid))
        throw new ApiError(
          403,
          "Suggestions are only available to this town’s mayors.",
        );
      if (record.testData)
        throw new ApiError(
          400,
          "Suggestions need a real EarthMC town, not a test record.",
        );
      const old = cache.get(id);
      if (old && now() - old.time < 300000) return old.data;
      if (pending.has(id)) return pending.get(id);
      if (pending.size >= 2)
        throw new ApiError(
          429,
          "Another scan is running. Please try again shortly.",
        );
      const job = scan(record).then((data) => {
        if (cache.size >= 50) cache.delete(cache.keys().next().value);
        cache.set(id, { time: now(), data });
        return data;
      });
      pending.set(id, job);
      try {
        return await job;
      } finally {
        pending.delete(id);
      }
    },
  };
}
