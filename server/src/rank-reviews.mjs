import { randomUUID } from "node:crypto";
import {
  ApiError,
  hasRole,
  reviewer,
  rolesOf,
  ROLES,
  digest,
} from "./security.mjs";
import { normalUuid } from "./earthmc-verification.mjs";
const base = "nations/byzantium",
  reviewers = ["operator", "leader", "prime_minister"];
export function createRankReviews(store, { now = Date.now } = {}) {
  const stamp = () => new Date(now()).toISOString();
  // Internal ingestion only: no HTTP route accepts a browser-supplied rank snapshot.
  async function queueRankReview(uid, snapshot) {
    if (
      !normalUuid(snapshot?.minecraftUuid) ||
      !Array.isArray(snapshot.unknownRanks)
    )
      throw new ApiError(400, "Verified rank information is required.");
    if (!snapshot.unknownRanks.length) return { ok: true };
    if (
      snapshot.unknownRanks.length > 100 ||
      snapshot.unknownRanks.some(
        (item) =>
          typeof item.rank !== "string" ||
          item.rank.length > 100 ||
          !["nation", "town", "title"].includes(item.source) ||
          item.key !== digest(item.source + ":" + item.rank),
      )
    )
      throw new ApiError(400, "Invalid rank information.");
    await store.transaction(async (tx) => {
      const target = await tx.get("users/" + uid),
        old = await tx.get(base + "/rank_reviews/" + uid);
      if (
        !target ||
        target.nation !== "byzantium" ||
        target.status !== "approved" ||
        normalUuid(target.minecraftUuid) !== snapshot.minecraftUuid ||
        target.minecraftVerified !== true
      )
        throw new ApiError(
          409,
          "The verified account no longer matches this rank information.",
        );
      const signature = digest(JSON.stringify(snapshot.unknownRanks));
      if (old?.signature === signature) return;
      tx.set(base + "/rank_reviews/" + uid, {
        id: uid,
        uid,
        username: target.username,
        minecraftUuid: snapshot.minecraftUuid,
        nation: "Byzantium",
        town: snapshot.town?.name || null,
        unknownRanks: snapshot.unknownRanks,
        status: "pending",
        version: (old?.version || 0) + 1,
        signature,
        createdAt: old?.createdAt || stamp(),
        updatedAt: stamp(),
      });
    });
    return { ok: true };
  }
  async function rankReviews(profile) {
    reviewer(profile);
    return (
      await store.list(base + "/rank_reviews", ["status", "pending"], 200)
    ).map(
      ({
        id,
        uid,
        username,
        nation,
        town,
        unknownRanks,
        version,
        createdAt,
      }) => ({
        id,
        uid,
        username,
        nation,
        town,
        unknownRanks,
        version,
        createdAt,
      }),
    );
  }
  async function resolveRankReview(profile, id, body) {
    if (!hasRole(profile, reviewers))
      throw new ApiError(
        403,
        "Only the Operator, Leader or Prime Minister can resolve ranks.",
      );
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id))
      throw new ApiError(400, "Invalid rank review.");
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        review = await tx.get(base + "/rank_reviews/" + id),
        target = review ? await tx.get("users/" + review.uid) : null;
      if (!hasRole(actor, reviewers))
        throw new ApiError(403, "Rank review access was removed.");
      if (
        !review ||
        review.status !== "pending" ||
        review.version !== body.version
      )
        throw new ApiError(
          409,
          "This rank review has changed. Refresh and try again.",
        );
      if (
        !target ||
        target.nation !== "byzantium" ||
        target.status !== "approved" ||
        (target.minecraftVerified !== true && target.emcIdentityReviewed !== true) ||
        normalUuid(target.minecraftUuid) !== review.minecraftUuid
      )
        throw new ApiError(
          409,
          "This verified account is no longer available.",
        );
      if (rolesOf(target).includes("operator") && !hasRole(actor, ["operator"]))
        throw new ApiError(403, "Only an Operator can change Operator roles.");
      const mappings = body.mappings,
        keys = review.unknownRanks.map((rank) => rank.key),
        permitted = ROLES.filter(
          (role) => !["operator", "mayor"].includes(role),
        );
      if (
        !mappings ||
        typeof mappings !== "object" ||
        Array.isArray(mappings) ||
        Object.keys(mappings).length !== keys.length ||
        keys.some(
          (key) =>
            !Object.hasOwn(mappings, key) || !permitted.includes(mappings[key]),
        )
      )
        throw new ApiError(
          400,
          "Choose a role for each rank. Operator and town ownership cannot be granted here.",
        );
      const roles = [
        ...new Set([...rolesOf(target), ...Object.values(mappings)]),
      ];
      tx.set("users/" + target.uid, { ...target, roles });
      tx.set(base + "/rank_reviews/" + id, {
        ...review,
        status: "resolved",
        version: review.version + 1,
        mappings,
        resolvedBy: actor.uid,
        resolvedAt: stamp(),
        updatedAt: stamp(),
      });
      tx.set(base + "/audit/" + randomUUID(), {
        actor: actor.username,
        actorUid: actor.uid,
        action: "rank_review.resolved",
        target: target.username,
        changes: { mappings, roles },
        createdAt: stamp(),
        updatedAt: stamp(),
      });
    });
    return { ok: true };
  }
  return { queueRankReview, rankReviews, resolveRankReview };
}
