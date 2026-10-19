import { normalUuid } from "./earthmc-verification.mjs";
const testTown = (town) => town.testData === true || town.id === "test-town";
export function createTownStats(
  store,
  { fetchImpl = fetch, now = Date.now } = {},
) {
  let saved = null,
    pending = null;
  return async () => {
    const towns = (await (store.listAll ? store.listAll("nations/byzantium/towns") : store.list("nations/byzantium/towns", null, 10000))).filter(
      (town) => !testTown(town),
    );
    const key = JSON.stringify(
      towns.map((town) => [town.id, town.earthmcUuid || town.name]),
    );
    if (saved?.key === key && saved.expires > now()) return saved.data;
    if (pending?.key === key) return pending.work;
    const work = (async () => {
      const data = {};
      let failed = false;
      for (let start = 0; start < towns.length; start += 50) {
        const batch = towns.slice(start, start + 50);
        try {
          const response = await fetchImpl("https://api.earthmc.net/v4/towns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: batch.map((town) => town.earthmcUuid || town.name),
            }),
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          });
          if (!response.ok) throw Error();
          const items = await response.json();
          if (!Array.isArray(items)) throw Error();
          for (const town of batch) {
            const match = items.find(
              (item) =>
                item &&
                (town.earthmcUuid
                  ? normalUuid(item.uuid) &&
                    normalUuid(item.uuid) === normalUuid(town.earthmcUuid)
                  : typeof item.name === "string" &&
                    item.name.toLowerCase() === town.name.toLowerCase()) &&
                item.nation?.name?.toLowerCase() === "byzantium",
            );
            const valid = (value) => Number.isSafeInteger(value) && value >= 0;
            data[town.id] =
              match &&
              valid(match.stats?.numResidents) &&
              valid(match.stats?.numTownBlocks)
                ? {
                    earthmcResidents: match.stats.numResidents,
                    claimedChunks: match.stats.numTownBlocks,
                    checkedAt: new Date(now()).toISOString(),
                  }
                : null;
          }
        } catch {
          failed = true;
          for (const town of batch) data[town.id] = null;
        }
      }
      saved = { key, data, expires: now() + (failed ? 10000 : 60000) };
      return data;
    })();
    pending = { key, work };
    try {
      return await work;
    } finally {
      if (pending?.work === work) pending = null;
    }
  };
}
