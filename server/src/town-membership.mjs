// Legacy single-mayor records remain valid until they are updated.
export const isTownMayor = (town, uid) =>
  !!uid &&
  !!town &&
  (town.mayorUid === uid ||
    (Array.isArray(town.mayorUids) && town.mayorUids.includes(uid)));

export async function withVerifiedResidents(store, towns) {
  if (!towns.some((town) => town.earthmcUuid)) return towns;
  const users = await (store.listAll
    ? store.listAll("users", ["nation", "byzantium"])
    : store.list("users", ["nation", "byzantium"], 10000));
  const details = await (store.listAll
    ? store.listAll("nations/byzantium/town_details")
    : store.list("nations/byzantium/town_details", null, 10000));
  return towns.map((town) => {
    if (!town.earthmcUuid || town.residentsManaged) return town;
    const previous =
      details.find((item) => item.id === town.id)?.registeredResidents ||
      town.registeredResidents ||
      [];
    const residents = [
      ...new Set([
        ...previous,
        ...users
          .filter(
            (user) =>
              user.authType === "records" &&
              user.status === "approved" &&
              user.minecraftVerified === true &&
              user.earthmcTownUuid === town.earthmcUuid,
          )
          .map((user) => user.username),
      ]),
    ];
    return {
      ...town,
      registeredResidents: residents,
      recordsResidents: residents.length,
    };
  });
}
