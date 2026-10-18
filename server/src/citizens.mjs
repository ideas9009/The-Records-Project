import { createEarthMcProfile } from "./earthmc-profile.mjs";
import { ApiError, rolesOf } from "./security.mjs";
const base = "nations/byzantium";
// This projection is independent of the administrative account directory.
export function createCitizens(store, options = {}) {
  const lookupEarthMc = createEarthMcProfile(options);
  const listAll = (path, filter = null) =>
    store.listAll
      ? store.listAll(path, filter)
      : store.list(path, filter, 10000);
  function allowed(profile) {
    if (
      profile?.authType !== "records" ||
      profile?.nation !== "byzantium" ||
      !["pending", "approved"].includes(profile?.status)
    )
      throw new ApiError(403, "Citizen directory access is unavailable.");
  }
  async function directory(profile) {
    allowed(profile);
    const [users, towns, details] = await Promise.all([
      listAll("users", ["nation", "byzantium"]),
      listAll(base + "/towns"),
      listAll(base + "/town_details"),
    ]);
    const members = new Map(
      details.map((item) => [
        item.id,
        Array.isArray(item.registeredResidents)
          ? item.registeredResidents
              .filter((name) => typeof name === "string")
              .map((name) => name.toLowerCase())
          : [],
      ]),
    );
    return users
      .filter(
        (user) =>
          user.authType === "records" &&
          user.nation === "byzantium" &&
          user.status === "approved",
      )
      .map((user) => ({
        uid: user.uid,
        username: user.username,
        roles: rolesOf(user),
        joinedAt:
          typeof user.createdAt === "string" &&
          Number.isFinite(Date.parse(user.createdAt))
            ? user.createdAt
            : null,
        towns: towns
          .filter(
            (town) =>
              town.mayorUid === user.uid ||
              (user.minecraftVerified === true &&
                !!town.earthmcUuid &&
                user.earthmcTownUuid === town.earthmcUuid) ||
              members.get(town.id)?.includes(user.username.toLowerCase()),
          )
          .map((town) => ({
            id: town.id,
            name: town.name,
            mayor: town.mayorUid === user.uid,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }
  async function citizen(profile, uid) {
    allowed(profile);
    if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(uid))
      throw new ApiError(400, "Invalid citizen identifier.");
    const users = await directory(profile),
      user = users.find((item) => item.uid === uid);
    if (!user) throw new ApiError(404, "Citizen not found.");
    return user;
  }
  return {
    citizens: directory,
    citizen,
    citizenEarthMc: async (profile, uid) => {
      const user = await citizen(profile, uid);
      return lookupEarthMc(user.username);
    },
  };
}
