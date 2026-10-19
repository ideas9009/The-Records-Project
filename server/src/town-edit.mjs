import { ApiError, hasRole, rolesOf } from "./security.mjs";
import { isTownMayor } from "./town-membership.mjs";
import { randomUUID } from "node:crypto";
const base = "nations/byzantium";
const senior = ["operator", "leader", "prime_minister"];
const valid = (user) =>
  user?.authType === "records" && user.nation === "byzantium";
const idsOf = (town) => [
  ...new Set([
    ...(town.mayorUids || []),
    ...(town.mayorUid ? [town.mayorUid] : []),
  ]),
];
const keyOf = (name) => Buffer.from(name.toLowerCase()).toString("base64url");
function permission(actor, town, mayors) {
  if (!valid(actor) || actor.status !== "approved")
    return { canEdit: false, canManageMayors: false };
  if (hasRole(actor, senior)) return { canEdit: true, canManageMayors: true };
  if (hasRole(actor, ["admin"])) {
    const blocked = mayors.some(
      (mayor) =>
        !valid(mayor) ||
        rolesOf(mayor).some((role) => [...senior, "admin"].includes(role)),
    );
    return { canEdit: !blocked, canManageMayors: !blocked };
  }
  return {
    canEdit: hasRole(actor, ["mayor"]) && isTownMayor(town, actor.uid),
    canManageMayors: false,
  };
}
export function createTownEdit(store, { now = Date.now } = {}) {
  const safe = (id) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id))
      throw new ApiError(400, "Invalid town.");
  };
  async function editAccess(profile, id) {
    safe(id);
    const actor = await store.get("users/" + profile.uid),
      town = await store.get(base + "/towns/" + id);
    if (!town) throw new ApiError(404, "Town not found.");
    return permission(
      actor,
      town,
      await Promise.all(idsOf(town).map((uid) => store.get("users/" + uid))),
    );
  }
  async function updateTown(profile, id, body) {
    safe(id);
    const name =
      typeof body.name === "string"
        ? body.name.trim().replace(/\s+/g, " ")
        : "";
    if (!name || name.length > 80 || /[\x00-\x1f/\\]/.test(name))
      throw new ApiError(400, "Enter a valid town name.");
    if (
      ![
        "capital",
        "settlement",
        "village",
        "small_town",
        "major_town",
        "city",
      ].includes(body.type)
    )
      throw new ApiError(400, "Select a town type.");
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        town = await tx.get(base + "/towns/" + id),
        details = await tx.get(base + "/town_details/" + id);
      if (!town || !details) throw new ApiError(404, "Town not found.");
      const owners = await Promise.all(
        idsOf(town).map((uid) => tx.get("users/" + uid)),
      );
      const access = permission(actor, town, owners);
      if (!access.canEdit)
        throw new ApiError(
          403,
          "You cannot edit this town. Admins cannot edit towns belonging to Admins or higher ranks.",
        );
      if (body.version !== (town.version || 0))
        throw new ApiError(
          409,
          "This town changed. Refresh it before editing again.",
        );
      const mayorUids = body.mayorUids ?? idsOf(town);
      if (
        !Array.isArray(mayorUids) ||
        !mayorUids.length ||
        mayorUids.length > 20 ||
        new Set(mayorUids).size !== mayorUids.length ||
        mayorUids.some(
          (uid) =>
            typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(uid),
        )
      )
        throw new ApiError(400, "Select between 1 and 20 mayors.");
      const changedMayors =
        JSON.stringify(mayorUids) !== JSON.stringify(idsOf(town));
      if (changedMayors && !access.canManageMayors)
        throw new ApiError(
          403,
          "Only authorized administrators can change the town's mayors.",
        );
      const mayors = await Promise.all(
        mayorUids.map((uid) => tx.get("users/" + uid)),
      );
      if (mayors.some((mayor) => !valid(mayor)))
        throw new ApiError(400, "Select registered users.");
      if (
        changedMayors &&
        hasRole(actor, ["admin"]) &&
        !hasRole(actor, senior) &&
        mayors.some((mayor) =>
          rolesOf(mayor).some((role) => [...senior, "admin"].includes(role)),
        )
      )
        throw new ApiError(
          403,
          "Admins cannot assign Admins or higher ranks as town mayors.",
        );
      const claim = await tx.get(base + "/town_names/" + keyOf(name)),
        capital = await tx.get(base + "/town_settings/capital");
      if (claim && claim.id !== id)
        throw new ApiError(409, "A town with this name is already registered.");
      if (body.type === "capital" && capital && capital.id !== id)
        throw new ApiError(
          409,
          capital.name +
            " is already the capital. Only one capital is allowed.",
        );
      const stamp = new Date(now()).toISOString(),
        mayorNames = mayors.map((mayor) => mayor.username),
        leadership = {
          mayor: mayorNames[0],
          mayorUid: mayorUids[0],
          mayorUids,
          mayorNames,
        };
      const residents = [
        ...new Set([...(details.registeredResidents || []), ...mayorNames]),
      ];
      if (keyOf(town.name) !== keyOf(name))
        tx.remove(base + "/town_names/" + keyOf(town.name));
      tx.set(base + "/town_names/" + keyOf(name), { id });
      if (body.type === "capital")
        tx.set(base + "/town_settings/capital", { id, name });
      else if (capital?.id === id) tx.remove(base + "/town_settings/capital");
      tx.set(base + "/towns/" + id, {
        ...town,
        name,
        type: body.type,
        ...leadership,
        recordsResidents: residents.length,
        version: (town.version || 0) + 1,
        updatedAt: stamp,
      });
      tx.set(base + "/town_details/" + id, {
        ...details,
        ...leadership,
        registeredResidents: residents,
      });
      if (changedMayors)
        mayors.forEach((mayor, index) =>
          tx.set("users/" + mayorUids[index], {
            ...mayor,
            roles: [...new Set([...rolesOf(mayor), "mayor"])],
          }),
        );
      tx.set(base + "/audit/" + randomUUID(), {
        actor: actor.username,
        actorUid: actor.uid,
        action: "town.updated",
        target: name,
        changes: { type: body.type, mayors: mayorNames },
        createdAt: stamp,
        updatedAt: stamp,
      });
    });
    return { id };
  }
  return { townEditAccess: editAccess, updateTown };
}
