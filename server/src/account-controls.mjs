import { randomUUID } from "node:crypto";
import { ApiError, reviewer, hasRole, rolesOf } from "./security.mjs";
import { normalUuid } from "./earthmc-verification.mjs";
export const disabledIdentityPath = (id) => {
  const uuid = normalUuid(id);
  return uuid ? "disabled_minecraft_accounts/" + uuid : null;
};
export async function identityDisabled(reader, id) {
  const path = disabledIdentityPath(id);
  if (!path) return false;
  const entry = await reader.get(path);
  for (const uid of entry?.uids || [])
    if ((await reader.get("users/" + uid))?.status === "disabled") return true;
  return false;
}
export function requireAccountModerator(actor, target) {
  if (actor?.authType !== "records" || actor.nation !== "byzantium") throw new ApiError(403,"You do not have permission for this action.");
  reviewer(actor);
  if (actor.uid === target.uid)
    throw new ApiError(409, "You cannot change your own account access.");
  if (!hasRole(actor, ["operator"]) && rolesOf(target).includes("operator"))
    throw new ApiError(403, "Only an Operator can moderate an Operator.");
  if (
    !hasRole(actor, ["operator", "leader", "prime_minister"]) &&
    rolesOf(target).some((role) => !["citizen", "army"].includes(role))
  )
    throw new ApiError(
      403,
      "Only the Operator, Leader or Prime Minister can moderate privileged accounts.",
    );
}
export function createAccountControls(store, { now = Date.now } = {}) {
  return {
    setAccountEnabled: async (profile, uid, body) => {
      reviewer(profile);
      if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(uid))
        throw new ApiError(400, "Invalid account.");
      if (
        typeof body.enabled !== "boolean" ||
        typeof body.expectedStatus !== "string"
      )
        throw new ApiError(
          400,
          "Choose whether to enable or disable this account.",
        );
      await store.transaction(async (tx) => {
        const actor = await tx.get("users/" + profile.uid),
          target = await tx.get("users/" + uid);
        if (
          !target ||
          target.authType !== "records" ||
          target.nation !== "byzantium"
        )
          throw new ApiError(404, "Account not found.");
        requireAccountModerator(actor, target);
        if (target.status !== body.expectedStatus)
          throw new ApiError(
            409,
            "This account changed. Refresh and try again.",
          );
        if ((target.status !== "disabled") === body.enabled)
          throw new ApiError(
            409,
            body.enabled
              ? "This account is already enabled."
              : "This account is already disabled.",
          );
        const indexPath = disabledIdentityPath(target.minecraftUuid || target.registration?.minecraftUuid),
          index = indexPath ? await tx.get(indexPath) : null;
        const statuses = ["pending", "approved", "suspended", "rejected"];
        const stamp = new Date(now()).toISOString();
        const next = { ...target, authVersion: (target.authVersion || 0) + 1 };
        if (body.enabled) {
          next.status = statuses.includes(target.disabledPreviousStatus)
            ? target.disabledPreviousStatus
            : "pending";
          next.enabledAt = stamp;
          next.enabledBy = actor.uid;
          delete next.disabledPreviousStatus;
          delete next.disabledAt;
          delete next.disabledBy;
        } else {
          if (!statuses.includes(target.status))
            throw new ApiError(409, "This account cannot be disabled.");
          next.status = "disabled";
          next.disabledPreviousStatus = target.status;
          next.disabledAt = stamp;
          next.disabledBy = actor.uid;
        }
        // All reads are complete before any account or identity-index writes.
        tx.set("users/" + uid, next);
        if (indexPath) {
          const uids = new Set(Array.isArray(index?.uids) ? index.uids : []);
          if (body.enabled) uids.delete(uid);
          else uids.add(uid);
          if (uids.size) tx.set(indexPath, { uids: [...uids] });
          else if (index) tx.remove(indexPath);
        }
        tx.set("nations/byzantium/audit/" + randomUUID(), {
          actor: actor.username,
          actorUid: actor.uid,
          action: body.enabled ? "user.enabled" : "user.disabled",
          target: target.username,
          changes: { status: next.status },
          createdAt: stamp,
          updatedAt: stamp,
        });
      });
      return { ok: true };
    },
  };
}
