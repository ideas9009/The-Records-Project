import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./memory-store.mjs";
import { createService } from "../src/service.mjs";
import { rolesOf } from "../src/security.mjs";
const base = "nations/byzantium";
async function fixture(roles = ["operator"]) {
  const store = memoryStore(),
    service = createService(store);
  const actor = {
      uid: "actor",
      username: "Actor",
      authType: "records",
      nation: "byzantium",
      role: "citizen",
      roles,
      status: "approved",
    },
    target = {
      uid: "target",
      username: "Target",
      authType: "records",
      nation: "byzantium",
      role: "member",
      status: "pending",
      password: "legacy-secret",
    };
  await store.set("users/actor", actor);
  await store.set("users/target", target);
  return { store, service, actor, target };
}
for (const role of [
  "operator",
  "leader",
  "prime_minister",
  "admin",
  "minister",
  "deputy",
  "mayor",
  "citizen",
])
  test(role + " town registration permissions are enforced", async () => {
    const f = await fixture([role]),
      allowed = [
        "operator",
        "leader",
        "prime_minister",
        "admin",
        "minister",
      ].includes(role);
    if (allowed) {
      const { id } = await f.service.registerTown(f.actor, {
        name: "New Town",
        mayorUid: "target",
      });
      const town = await f.store.get(base + "/towns/" + id);
      assert.equal(town.mayorUid, "target");
      assert.deepEqual(rolesOf(await f.store.get("users/target")), [
        "citizen",
        "mayor",
      ]);
      assert.equal((await f.service.mayorOptions(f.actor)).length, 2);
      assert.equal((await f.store.list(base + "/audit")).length, 1);
    } else {
      await assert.rejects(
        f.service.registerTown(f.actor, {
          name: "New Town",
          mayorUid: "target",
        }),
        (e) => e.status === 403,
      );
      await assert.rejects(
        f.service.mayorOptions(f.actor),
        (e) => e.status === 403,
      );
    }
  });
test("multi-role permissions combine without losing roles when assigned a town", async () => {
  const f = await fixture(["operator", "minister"]);
  await f.service.registerTown(f.actor, { name: "Capital", mayorUid: "actor" });
  assert.deepEqual(rolesOf(await f.store.get("users/actor")), [
    "operator",
    "minister",
    "mayor",
  ]);
  await f.service.updateUser(f.actor, "target", {
    roles: ["minister", "deputy", "citizen"],
  });
  assert.deepEqual(rolesOf(await f.store.get("users/target")), [
    "citizen",
    "deputy",
    "minister",
  ]);
  assert.equal(
    (await f.service.adminUsers(f.actor)).find((u) => u.uid === "target")
      .password,
    undefined,
  );
});
test("role changes protect Operator and own management access", async () => {
  const f = await fixture(["leader"]);
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { roles: ["operator"] }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.service.updateUser(f.actor, "actor", { roles: ["citizen"] }),
    (e) => e.status === 409,
  );
  await f.store.set("users/target", {
    ...f.target,
    roles: ["operator"],
    status: "approved",
  });
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { roles: ["citizen"] }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { status: "suspended" }),
    (e) => e.status === 403,
  );
});
test("Admin can moderate citizens but cannot assign roles or moderate government accounts", async () => {
  const f = await fixture(["admin"]);
  await f.service.updateUser(f.actor, "target", { status: "approved" });
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { roles: ["admin"] }),
    (e) => e.status === 403,
  );
  await f.store.set("users/target", { ...f.target, roles: ["minister"] });
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { status: "approved" }),
    (e) => e.status === 403,
  );
});
test("invalid and duplicate towns do not partially assign Mayor or write audit entries", async () => {
  const f = await fixture();
  await assert.rejects(
    f.service.registerTown(f.actor, { name: "Town", mayorUid: "missing" }),
    (e) => e.status === 400,
  );
  const results = await Promise.allSettled([
    f.service.registerTown(f.actor, { name: " Town ", mayorUid: "target" }),
    f.service.registerTown(f.actor, { name: "town", mayorUid: "target" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list(base + "/towns")).length, 1);
  assert.equal((await f.store.list(base + "/audit")).length, 1);
});
test("transaction checks revoked actor privileges, invalid roles and foreign users", async () => {
  const f = await fixture();
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { roles: ["superuser"] }),
    (e) => e.status === 400,
  );
  await f.store.set("users/actor", { ...f.actor, roles: ["citizen"] });
  await assert.rejects(
    f.service.registerTown(f.actor, { name: "Town", mayorUid: "target" }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { roles: ["admin"] }),
    (e) => e.status === 403,
  );
});
test("Prime Minister reviews registrations; Deputy publishes but cannot review", async () => {
  const f = await fixture(["prime_minister"]);
  await f.service.updateUser(f.actor, "target", { status: "approved" });
  await f.store.set("users/actor", { ...f.actor, roles: ["deputy"] });
  const deputy = await f.store.get("users/actor");
  await assert.rejects(f.service.requests(deputy), (e) => e.status === 403);
  const article = await f.service.newsSave(deputy, {
    title: "Notice",
    body: "Text",
    format: "markdown",
    status: "draft",
  });
  assert.ok(article.id);
});

for (const protectedRole of [
  "operator",
  "leader",
  "prime_minister",
  "admin",
  "minister",
  "deputy",
  "mayor",
]) {
  test(
    "Admin cannot rewrite or remove " +
      protectedRole +
      " access on a multi-role account",
    async () => {
      const f = await fixture(["admin", "mayor", "citizen"]);
      const target = {
        ...f.target,
        status: "approved",
        roles: ["citizen", protectedRole, "army"],
      };
      await f.store.set("users/target", target);
      for (const body of [
        { roles: ["citizen"] },
        { roles: ["citizen", "admin"] },
        { roles: [...target.roles, "minister"] },
        { roles: ["citizen"], status: "approved" },
      ]) {
        await assert.rejects(
          f.service.updateUser(f.actor, "target", body),
          (e) => e.status === 403,
        );
        assert.deepEqual(await f.store.get("users/target"), target);
        assert.equal((await f.store.list(base + "/audit")).length, 0);
      }
    },
  );
}
test("current actor permissions override a previously loaded management profile", async () => {
  const f = await fixture(["leader"]);
  await f.store.set("users/actor", { ...f.actor, roles: ["admin", "mayor"] });
  const target = {
    ...f.target,
    status: "approved",
    roles: ["prime_minister", "mayor"],
  };
  await f.store.set("users/target", target);
  await assert.rejects(
    f.service.updateUser(f.actor, "target", { roles: ["citizen"] }),
    (e) => e.status === 403,
  );
  assert.deepEqual(await f.store.get("users/target"), target);
  assert.equal((await f.store.list(base + "/audit")).length, 0);
});
