import { randomUUID } from "node:crypto";
import {
  ApiError,
  approved,
  reviewer,
  publicProfile,
  hasRole,
  rolesOf,
  ROLES,
} from "./security.mjs";
const base = "nations/byzantium",
  management = ["operator", "leader", "prime_minister"],
  registrars = [...management, "admin", "minister"];
export function createAdministration(
  store,
  { now = Date.now, approveManual, registrationState } = {},
) {
  const stamp = () => new Date(now()).toISOString();
  const valid = (target) =>
    target?.authType === "records" && target.nation === "byzantium";
  const requireRole = (actor, roles) => {
    approved(actor);
    if (!hasRole(actor, roles))
      throw new ApiError(403, "You do not have permission for this action.");
  };
  const audit = (tx, actor, action, target, changes = {}) =>
    tx.set(base + "/audit/" + randomUUID(), {
      actor: actor.username,
      actorUid: actor.uid,
      action,
      target,
      changes,
      createdAt: stamp(),
      updatedAt: stamp(),
    });
  async function users(profile, mayors = false) {
    requireRole(profile, mayors ? registrars : [...management, "admin"]);
    const records = await (store.listAll
      ? store.listAll("users", ["nation", "byzantium"])
      : store.list("users", ["nation", "byzantium"], 10000));
    const projected = records
      .filter(valid)
      .map((item) =>
        mayors
          ? { uid: item.uid, username: item.username, status: item.status }
          : publicProfile({ ...item, roles: rolesOf(item) }),
      )
      .sort((a, b) => a.username.localeCompare(b.username));
    return mayors || !registrationState
      ? projected
      : Promise.all(
          projected.map(async (item) => ({
            ...item,
            ...(await registrationState(item)),
          })),
        );
  }
  async function updateUser(profile, uid, body) {
    reviewer(profile);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(uid))
      throw new ApiError(400, "Invalid user.");
    if (body.status === "approved" && approveManual) {
      const pending = await store.get("users/" + uid);
      if (
        pending?.registrationMethod === "manual-emc" &&
        !pending.emcIdentityReviewed
      ) {
        if (body.roles !== undefined)
          throw new ApiError(
            400,
            "Approve the registration before editing its roles.",
          );
        if (await approveManual(profile, uid)) return { ok: true };
      }
    }
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        target = await tx.get("users/" + uid);
      reviewer(actor);
      if (!valid(target)) throw new ApiError(404, "User not found.");
      const next = { ...target },
        changes = {};
      if (body.roles !== undefined) {
        requireRole(actor, management);
        if (
          !Array.isArray(body.roles) ||
          !body.roles.length ||
          body.roles.some((role) => !ROLES.includes(role))
        )
          throw new ApiError(400, "Select at least one valid role.");
        const roles = [...new Set(body.roles)].sort();
        if (
          !hasRole(actor, ["operator"]) &&
          (rolesOf(target).includes("operator") || roles.includes("operator"))
        )
          throw new ApiError(
            403,
            "Only an Operator can change Operator access.",
          );
        if (
          actor.uid === uid &&
          rolesOf(actor).some(
            (role) => management.includes(role) && !roles.includes(role),
          )
        )
          throw new ApiError(
            409,
            "You cannot remove your own management access.",
          );
        next.roles = roles;
        next.role = ROLES.find((role) => roles.includes(role));
        changes.roles = roles;
      }
      if (body.status !== undefined) {
        if (
          !["approved", "rejected", "suspended", "pending"].includes(
            body.status,
          )
        )
          throw new ApiError(400, "Invalid account status.");
        if (actor.uid === uid)
          throw new ApiError(409, "You cannot change your own account status.");
        if (
          !hasRole(actor, ["operator"]) &&
          rolesOf(target).includes("operator")
        )
          throw new ApiError(403, "Only an Operator can moderate an Operator.");
        if (
          !hasRole(actor, management) &&
          rolesOf(target).some((role) => !["citizen", "army"].includes(role))
        )
          throw new ApiError(
            403,
            "Only the Operator, Leader or Prime Minister can moderate privileged accounts.",
          );
        next.status = body.status;
        changes.status = body.status;
        if (body.status === "approved") {
          next.approvedBy = actor.uid;
          next.approvedAt = stamp();
        }
      }
      if (!Object.keys(changes).length)
        throw new ApiError(400, "No changes supplied.");
      tx.set("users/" + uid, next);
      audit(tx, actor, "user.updated", target.username, changes);
    });
    return { ok: true };
  }
  async function registerTown(profile, body) {
    requireRole(profile, registrars);
    const name =
      typeof body.name === "string"
        ? body.name.trim().replace(/\s+/g, " ")
        : "";
    const type = body.type ?? "settlement";
    const mayorUids = body.mayorUids ?? (body.mayorUid ? [body.mayorUid] : []);
    if (
      !name ||
      name.length > 80 ||
      /[\x00-\x1f/\\]/.test(name) ||
      !Array.isArray(mayorUids) ||
      !mayorUids.length ||
      mayorUids.length > 20 ||
      new Set(mayorUids).size !== mayorUids.length ||
      mayorUids.some(
        (uid) => typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(uid),
      )
    )
      throw new ApiError(
        400,
        "Enter a town name and select between 1 and 20 mayors.",
      );
    if (
      ![
        "capital",
        "settlement",
        "village",
        "small_town",
        "major_town",
        "city",
      ].includes(type)
    )
      throw new ApiError(400, "Select a valid town type.");
    const key = Buffer.from(name.toLowerCase()).toString("base64url"),
      id = randomUUID();
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid);
      const mayors = await Promise.all(
        mayorUids.map((uid) => tx.get("users/" + uid)),
      );
      const existing = await tx.get(base + "/town_names/" + key);
      const capital =
        type === "capital"
          ? await tx.get(base + "/town_settings/capital")
          : null;
      requireRole(actor, registrars);
      if (mayors.some((mayor) => !valid(mayor)))
        throw new ApiError(400, "Select registered users as mayors.");
      if (existing)
        throw new ApiError(409, "A town with this name is already registered.");
      if (capital)
        throw new ApiError(
          409,
          capital.name +
            " is already the capital. Only one capital is allowed.",
        );
      if (
        mayors.some(
          (mayor) =>
            mayor.registrationMethod === "manual-emc" &&
            mayor.status !== "approved",
        )
      )
        throw new ApiError(
          409,
          "Approve the manual mayor registration before registering the town.",
        );
      const mayorNames = mayors.map((mayor) => mayor.username);
      const leadership = {
        mayor: mayorNames[0],
        mayorUid: mayorUids[0],
        mayorUids,
        mayorNames,
      };
      const town = {
        id,
        name,
        type,
        nation: "Byzantium",
        ...leadership,
        recordsResidents: mayors.length,
        earthmcResidents: 0,
        claimedChunks: 0,
        testData: false,
        image: "/wallpapers/2026-06-09_13.05.52_4K.webp",
        createdAt: stamp(),
        createdBy: actor.uid,
      };
      if (type === "capital")
        tx.set(base + "/town_settings/capital", { id, name });
      tx.set(base + "/town_names/" + key, { id });
      tx.set(base + "/towns/" + id, town);
      tx.set(base + "/town_details/" + id, {
        ...leadership,
        registeredResidents: mayorNames,
      });
      mayors.forEach((mayor, index) =>
        tx.set("users/" + mayorUids[index], {
          ...mayor,
          roles: [...new Set([...rolesOf(mayor), "mayor"])],
        }),
      );
      audit(tx, actor, "town.registered", name, { type, mayors: mayorNames });
    });
    return { id };
  }
  return {
    adminUsers: users,
    mayorOptions: (profile) => users(profile, true),
    updateUser,
    registerTown,
    activity: async (profile) => {
      reviewer(profile);
      return store.newsList(base + "/audit", null, 200);
    },
  };
}
