import { randomUUID } from "node:crypto";
import { ApiError, approved, hasRole, rolesOf } from "./security.mjs";
const base = "nations/byzantium";
const managers = ["operator", "leader", "prime_minister"];
export function createRecordRemoval(store, { now = Date.now } = {}) {
  function allowed(actor) {
    if (!actor) throw new ApiError(403, "Your account is unavailable.");
    approved(actor);
    if (
      actor.authType !== "records" ||
      actor.nation !== "byzantium" ||
      !hasRole(actor, managers)
    )
      throw new ApiError(
        403,
        "Only the Operator, Leader and Prime Minister can remove records.",
      );
  }
  const list = (path, filter = null) =>
    store.listAll
      ? store.listAll(path, filter)
      : store.list(path, filter, 10000);
  const safe = (id) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id))
      throw new ApiError(400, "Invalid record.");
  };
  const confirm = (body, name) => {
    if (body.confirmName !== name)
      throw new ApiError(400, "Type the exact name to confirm removal.");
  };
  const audit = (tx, actor, action, target) => {
    const stamp = new Date(now()).toISOString();
    tx.set(base + "/audit/" + randomUUID(), {
      actor: actor.username,
      actorUid: actor.uid,
      action,
      target,
      createdAt: stamp,
      updatedAt: stamp,
    });
  };
  async function removalTowns(profile) {
    allowed(await store.get("users/" + profile.uid));
    return (await list(base + "/towns"))
      .map((town) => ({
        id: town.id,
        name: town.name,
        mayor: town.mayor || "No mayor",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async function removalUsers(profile) {
    allowed(await store.get("users/" + profile.uid));
    return (await list("users", ["nation", "byzantium"]))
      .filter((user) => user.authType === "records")
      .map((user) => ({
        uid: user.uid,
        username: user.username,
        status: user.status,
        roles: rolesOf(user),
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }
  async function removeTown(profile, id, body) {
    safe(id);
    allowed(await store.get("users/" + profile.uid));
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        town = await tx.get(base + "/towns/" + id),
        capital = await tx.get(base + "/town_settings/capital");
      allowed(actor);
      if (!town) throw new ApiError(404, "Town not found.");
      confirm(body, town.name);
      const [users, names, maps, photos] = await Promise.all([
        tx.list("users", ["townId", id]),
        tx.list(base + "/town_names", ["id", id]),
        tx.list(base + "/earthmc_towns", ["id", id]),
        tx.list(base + "/town_details/" + id + "/photos"),
      ]);
      if (users.length + names.length + maps.length + photos.length > 400)
        throw new ApiError(
          409,
          "This town needs a larger database cleanup. No records were removed.",
        );

      const members = await Promise.all(
        users.map((user) => tx.get("users/" + user.uid)),
      );
      const paths = [
        ...names.map((item) => base + "/town_names/" + item.id),
        ...maps.map((item) => base + "/earthmc_towns/" + item.id),
      ];
      const links = await Promise.all(paths.map((path) => tx.get(path)));
      members.forEach((user) => {
        if (user?.townId === id) {
          const next = { ...user };
          delete next.townId;
          tx.set("users/" + user.uid, next);
        }
      });
      paths.forEach((path, index) => {
        if (links[index]?.id === id) tx.remove(path);
      });
      if (capital?.id === id) tx.remove(base + "/town_settings/capital");
      photos.forEach((photo) =>
        tx.remove(base + "/town_details/" + id + "/photos/" + photo.id),
      );
      tx.remove(base + "/town_details/" + id);
      tx.remove(base + "/towns/" + id);
      audit(tx, actor, "town.removed", town.name);
    });
    return { ok: true };
  }
  async function removeUser(profile, uid, body) {
    safe(uid);
    allowed(await store.get("users/" + profile.uid));
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        target = await tx.get("users/" + uid);
      allowed(actor);
      if (
        !target ||
        target.authType !== "records" ||
        target.nation !== "byzantium"
      )
        throw new ApiError(404, "Player not found.");
      if (uid === actor.uid)
        throw new ApiError(409, "You cannot remove your own account.");
      if (rolesOf(target).includes("operator") && !hasRole(actor, ["operator"]))
        throw new ApiError(403, "Only an Operator can remove an Operator.");
      if (target.status === "disabled") throw new ApiError(409,"Enable this account from Account access before removing it.");
      confirm(body, target.username);
      const [towns, sessions, names, claims] = await Promise.all([
        tx.list(base + "/towns"),
        tx.list("server_sessions", ["uid", uid]),
        tx.list("account_names", ["uid", uid]),
        tx.list("minecraft_accounts", ["uid", uid]),
      ]);
      // Bound the transaction rather than leaving a partially removed account.
      if (
        towns.length * 2 + sessions.length + names.length + claims.length >
        400
      )
        throw new ApiError(
          409,
          "This player needs a larger database cleanup. No records were removed.",
        );

      const records = await Promise.all(
        towns.map(async (item) => ({
          town: await tx.get(base + "/towns/" + item.id),
          details: await tx.get(base + "/town_details/" + item.id),
          id: item.id,
        })),
      );
      const paths = [
        ...sessions.map((item) => "server_sessions/" + item.id),
        ...names.map((item) => "account_names/" + item.id),
        ...claims.map((item) => "minecraft_accounts/" + item.id),
      ];
      const links = await Promise.all(paths.map((path) => tx.get(path)));
      for (const { town, details, id } of records) {
        if (!town) continue;
        const owners = [
          ...new Set([
            ...(town.mayorUids || []),
            ...(town.mayorUid ? [town.mayorUid] : []),
          ]),
        ];
        const residents = details?.registeredResidents || [];
        if (
          !owners.includes(uid) &&
          !residents.some(
            (name) => name.toLowerCase() === target.username.toLowerCase(),
          )
        )
          continue;
        const remaining = owners.filter((owner) => owner !== uid);
        const ownerNames = owners.map((owner, index) =>
          owner === town.mayorUid ? town.mayor : town.mayorNames?.[index] || "",
        );
        const remainingNames = remaining.map(
          (owner) => ownerNames[owners.indexOf(owner)],
        );
        const leadership = {
          mayorUids: remaining,
          mayorNames: remainingNames,
          mayorUid: remaining[0] || "",
          mayor: remainingNames[0] || "",
        };
        const members = residents.filter(
          (name) => name.toLowerCase() !== target.username.toLowerCase(),
        );
        tx.set(base + "/towns/" + id, {
          ...town,
          ...leadership,
          recordsResidents: details
            ? members.length
            : Math.max(0, (town.recordsResidents || 0) - 1),
          version: (town.version || 0) + 1,
        });
        if (details)
          tx.set(base + "/town_details/" + id, {
            ...details,
            ...leadership,
            registeredResidents: members,
          });
      }
      paths.forEach((path, index) => {
        if (links[index]?.uid === uid) tx.remove(path);
      });
      tx.remove(base + "/availability/" + uid);
      tx.remove(base + "/rank_reviews/" + uid);
      tx.remove("server_credentials/" + uid);
      tx.remove("users/" + uid);
      audit(tx, actor, "player.removed", target.username);
    });
    return { ok: true };
  }
  return { removalTowns, removalUsers, removeTown, removeUser };
}
