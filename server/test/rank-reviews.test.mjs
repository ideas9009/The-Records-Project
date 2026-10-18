import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./memory-store.mjs";
import { createService } from "../src/service.mjs";
import { digest } from "../src/security.mjs";
const base = "nations/byzantium",
  uuid = "123456781234123412341234567890ab",
  unknown = { key: digest("nation:Knight"), rank: "Knight", source: "nation" };
async function fixture(roles = ["operator"]) {
  const store = memoryStore(),
    service = createService(store),
    actor = {
      uid: "actor",
      username: "Actor",
      role: roles[0],
      roles,
      status: "approved",
      nation: "byzantium",
      authType: "records",
    },
    target = {
      uid: "target",
      username: "Target",
      role: "citizen",
      roles: ["citizen"],
      status: "approved",
      nation: "byzantium",
      authType: "records",
      minecraftVerified: true,
      minecraftUuid: uuid,
    };
  await store.set("users/actor", actor);
  await store.set("users/target", target);
  const snapshot = {
    minecraftUuid: uuid,
    town: { name: "Capital" },
    unknownRanks: [unknown],
  };
  return { store, service, actor, target, snapshot };
}
test("unverified and mismatched accounts cannot generate rank requests", async () => {
  const f = await fixture();
  await f.store.set("users/target", { ...f.target, minecraftVerified: false });
  await assert.rejects(
    f.service.queueRankReview("target", f.snapshot),
    (error) => error.status === 409,
  );
  await f.store.set("users/target", {
    ...f.target,
    minecraftUuid: "223456781234123412341234567890ab",
  });
  await assert.rejects(
    f.service.queueRankReview("target", f.snapshot),
    (error) => error.status === 409,
  );
});
test("unknown ranks queue idempotently without granting access", async () => {
  const f = await fixture();
  await f.service.queueRankReview("target", f.snapshot);
  await f.service.queueRankReview("target", f.snapshot);
  const requests = await f.service.rankReviews(f.actor);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].version, 1);
  assert.equal(requests[0].minecraftUuid, undefined);
  assert.deepEqual((await f.store.get("users/target")).roles, ["citizen"]);
});
for (const role of ["operator", "leader", "prime_minister"])
  test(
    role +
      " can resolve a request, preserving existing roles and recording audit",
    async () => {
      const f = await fixture([role]);
      await f.service.queueRankReview("target", f.snapshot);
      await f.service.resolveRankReview(f.actor, "target", {
        version: 1,
        mappings: { [unknown.key]: "army" },
      });
      assert.deepEqual((await f.store.get("users/target")).roles, [
        "citizen",
        "army",
      ]);
      assert.equal((await f.service.rankReviews(f.actor)).length, 0);
      assert.equal((await f.store.list(base + "/audit")).length, 1);
      await assert.rejects(
        f.service.resolveRankReview(f.actor, "target", {
          version: 1,
          mappings: { [unknown.key]: "minister" },
        }),
        (error) => error.status === 409,
      );
    },
  );
test("Admin can view requests but cannot grant roles; Army has no review privileges", async () => {
  const f = await fixture(["admin"]);
  await f.service.queueRankReview("target", f.snapshot);
  assert.equal((await f.service.rankReviews(f.actor)).length, 1);
  await assert.rejects(
    f.service.resolveRankReview(f.actor, "target", {
      version: 1,
      mappings: { [unknown.key]: "leader" },
    }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    f.service.rankReviews({ ...f.actor, roles: ["army"] }),
    (error) => error.status === 403,
  );
});
test("invalid mappings, ownership grants, stale versions and revoked reviewers are rejected", async () => {
  const f = await fixture();
  await f.service.queueRankReview("target", f.snapshot);
  for (const body of [
    { version: 1, mappings: { [unknown.key]: "operator" } },
    { version: 1, mappings: { [unknown.key]: "mayor" } },
    { version: 1, mappings: {} },
    { version: 2, mappings: { [unknown.key]: "minister" } },
  ])
    await assert.rejects(
      f.service.resolveRankReview(f.actor, "target", body),
      (error) => [400, 409].includes(error.status),
    );
  await f.store.set("users/actor", { ...f.actor, roles: ["citizen"] });
  await assert.rejects(
    f.service.resolveRankReview(f.actor, "target", {
      version: 1,
      mappings: { [unknown.key]: "minister" },
    }),
    (error) => error.status === 403,
  );
  assert.deepEqual((await f.store.get("users/target")).roles, ["citizen"]);
});
