import { ApiError, digest } from "./security.mjs";
export const normalUuid = (value) =>
  typeof value === "string" &&
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
    value,
  )
    ? value.replaceAll("-", "").toLowerCase()
    : null;
const clean = (value) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/§[0-9A-FK-OR]/gi, "")
        .trim()
        .slice(0, 100)
    : "";
const normalize = (value) =>
  clean(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const nationRoles = new Map([
  ["prime minister", "prime_minister"],
  ["minister", "minister"],
  ["deputy", "deputy"],
  ["army", "army"],
  ["citizen", "citizen"],
]);
export function mapEarthMcRanks(player, town) {
  const roles = new Set(["citizen"]),
    unknown = [],
    seen = new Set();
  const mayor =
    player.status?.isMayor === true &&
    !!normalUuid(player.uuid) &&
    normalUuid(town?.mayor?.uuid) === normalUuid(player.uuid) &&
    normalUuid(town?.uuid) === normalUuid(player.town?.uuid);
  if (mayor) roles.add("mayor");
  if (player.status?.isKing === true) roles.add("leader");
  function rank(raw, source) {
    const text = clean(raw),
      key = normalize(text);
    if (!text) return;
    if (source === "nation" && nationRoles.has(key)) {
      roles.add(nationRoles.get(key));
      return;
    }
    if (key === "army") {
      roles.add("army");
      return;
    }
    if (
      key === "citizen" ||
      (key === "king" && player.status?.isKing === true) ||
      (key === "mayor" && mayor)
    )
      return;
    const id = digest(source + ":" + text);
    if (!seen.has(id)) {
      unknown.push({ key: id, rank: text, source });
      seen.add(id);
    }
  }
  for (const raw of player.ranks?.nationRanks || []) rank(raw, "nation");
  for (const raw of player.ranks?.townRanks || []) rank(raw, "town");
  if (player.title) rank(player.title, "title");
  return { roles: [...roles], unknown, mayor };
}
// Call only after ownership has been established through Minecraft authentication.
export async function earthMcConfirmation(minecraft, { fetcher = fetch } = {}) {
  const uuid = normalUuid(minecraft?.uuid);
  if (!uuid)
    throw new ApiError(400, "A verified Minecraft profile is required.");
  async function query(type, id) {
    let response;
    try {
      response = await fetcher("https://api.earthmc.net/v4/" + type, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: [id] }),
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
    } catch {
      throw new ApiError(
        503,
        "EarthMC is unavailable. Retry or use manual verification.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        503,
        "EarthMC is unavailable. Retry or use manual verification.",
      );
    let items;
    try {
      items = await response.json();
    } catch {
      throw new ApiError(
        503,
        "EarthMC returned an invalid response. Please retry.",
      );
    }
    if (!Array.isArray(items))
      throw new ApiError(
        503,
        "EarthMC returned an invalid response. Please retry.",
      );
    return (
      items.find((item) => normalUuid(item.uuid) === normalUuid(id)) || null
    );
  }
  const player = await query("players", uuid);
  if (!player)
    throw new ApiError(
      422,
      "Your EarthMC profile is unavailable. It may be private; retry or use manual verification.",
    );
  if (player.status?.isNPC || normalize(player.nation?.name) !== "byzantium")
    throw new ApiError(
      403,
      "This registration requires membership in Byzantium.",
    );
  const townId = normalUuid(player.town?.uuid),
    town = townId ? await query("towns", townId) : null;
  if (
    !normalUuid(player.nation?.uuid) ||
    !town ||
    normalUuid(town.nation?.uuid) !== normalUuid(player.nation?.uuid)
  )
    throw new ApiError(
      503,
      "EarthMC town information could not be verified. Please retry.",
    );
  const mapped = mapEarthMcRanks(player, town);
  if (player.status?.isMayor === true && !mapped.mayor)
    throw new ApiError(
      503,
      "EarthMC mayor information could not be verified. Please retry.",
    );
  const balance = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  return {
    minecraftUuid: uuid,
    username: minecraft.username,
    nation: {
      name: clean(player.nation.name),
      uuid: normalUuid(player.nation.uuid),
    },
    town: {
      name: clean(town.name),
      uuid: townId,
      mayorUuid: normalUuid(town.mayor?.uuid),
    },
    isMayor: mapped.mayor,
    roles: mapped.roles,
    unknownRanks: mapped.unknown,
    ranks: [
      ...(player.ranks?.nationRanks || []),
      ...(player.ranks?.townRanks || []),
      ...(player.title ? [player.title] : []),
    ]
      .map(clean)
      .filter(Boolean),
    balance: balance(player.stats?.balance),
    townBalance: mapped.mayor ? balance(town.stats?.balance) : null,
    earthmcResidents: Number.isInteger(town.stats?.numResidents)
      ? town.stats.numResidents
      : null,
    claimedChunks: Number.isInteger(town.stats?.numTownBlocks)
      ? town.stats.numTownBlocks
      : null,
  };
}
