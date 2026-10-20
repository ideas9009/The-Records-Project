import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./memory-store.mjs";
import { createService } from "../src/service.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
const base = "nations/byzantium";
async function fixture(role = "operator") {
  const store = memoryStore(),
    service = createService(store);
  const actor = {
    uid: "actor",
    username: "Actor",
    authType: "records",
    nation: "byzantium",
    role,
    roles: [role],
    status: "approved",
  };
  const target = {
    ...actor,
    uid: "target",
    username: "Target",
    role: "mayor",
    roles: ["mayor"],
    townId: "town",
  };
  await store.set("users/actor", actor);
  await store.set("users/target", target);
  await store.set(base + "/towns/town", {
    id: "town",
    name: "Harbour",
    mayorUid: "target",
    mayor: "Target",
    mayorUids: ["target", "actor"],
    mayorNames: ["Target", "Actor"],
    recordsResidents: 2,
    version: 3,
  });
  await store.set(base + "/town_details/town", {
    mayorUid: "target",
    mayor: "Target",
    mayorUids: ["target", "actor"],
    mayorNames: ["Target", "Actor"],
    registeredResidents: ["Target", "Actor"],
  });
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
  "army",
  "citizen",
]) {
  test(
    role + " removal permissions apply to directories and mutations",
    async () => {
      const f = await fixture(role),
        allowed = ["operator", "leader", "prime_minister"].includes(role);
      if (allowed) {
        assert.equal((await f.service.removalTowns(f.actor)).length, 1);
        assert.equal((await f.service.removalUsers(f.actor)).length, 2);
        await f.service.removeTown(f.actor, "town", { confirmName: "Harbour" });
        await f.service.removeUser(f.actor, "target", {
          confirmName: "Target",
        });
      } else {
        for (const operation of [
          () => f.service.removalTowns(f.actor),
          () => f.service.removalUsers(f.actor),
          () =>
            f.service.removeTown(f.actor, "town", { confirmName: "Harbour" }),
          () =>
            f.service.removeUser(f.actor, "target", { confirmName: "Target" }),
        ])
          await assert.rejects(operation, (e) => e.status === 403);
        assert.ok(await f.store.get("users/target"));
        assert.ok(await f.store.get(base + "/towns/town"));
      }
    },
  );
}
test("town removal clears indices, capital, photos and member links without deleting players", async () => {
  const f = await fixture();
  for (const path of [
    "town_names/alias",
    "earthmc_towns/uuid",
    "town_settings/capital",
  ])
    await f.store.set(base + "/" + path, { id: "town" });
  await f.store.set(base + "/town_names/other", { id: "other" });
  await f.store.set(base + "/town_details/town/photos/0", { src: "photo" });
  await assert.rejects(
    f.service.removeTown(f.actor, "town", { confirmName: "wrong" }),
    (e) => e.status === 400,
  );
  assert.ok(await f.store.get(base + "/towns/town"));
  await f.service.removeTown(f.actor, "town", { confirmName: "Harbour" });
  for (const path of [
    "towns/town",
    "town_details/town",
    "town_names/alias",
    "earthmc_towns/uuid",
    "town_settings/capital",
    "town_details/town/photos/0",
  ])
    assert.equal(await f.store.get(base + "/" + path), null, path);
  assert.ok(await f.store.get(base + "/town_names/other"));
  assert.equal((await f.store.get("users/target")).townId, undefined);
  assert.equal((await f.store.list(base + "/audit"))[0].action, "town.removed");
});
test("player removal revokes access, releases claims, and preserves co-mayors and history", async () => {
  const f = await fixture();
  for (const path of [
    "account_names/target",
    "account_names/oldname",
    "minecraft_accounts/uuid",
    "server_sessions/abc",
  ])
    await f.store.set(path, { uid: "target", expiresAt: Date.now() + 99999 });
  await f.store.set("server_credentials/target", { hash: "secret" });
  await f.store.set(base + "/availability/target", { active: true });
  await f.store.set(base + "/rank_reviews/target", { status: "pending" });
  await f.store.set(base + "/task_board/history", { createdBy: "target" });
  await f.store.set("account_names/actor", { uid: "actor" });
  await f.service.removeUser(f.actor, "target", { confirmName: "Target" });
  for (const path of [
    "users/target",
    "server_credentials/target",
    "account_names/target",
    "account_names/oldname",
    "minecraft_accounts/uuid",
    "server_sessions/abc",
    base + "/availability/target",
    base + "/rank_reviews/target",
  ])
    assert.equal(await f.store.get(path), null, path);
  assert.ok(await f.store.get("account_names/actor"));
  assert.ok(await f.store.get(base + "/task_board/history"));
  const town = await f.store.get(base + "/towns/town");
  assert.deepEqual(town.mayorUids, ["actor"]);
  assert.equal(town.mayor, "Actor");
  assert.equal(town.recordsResidents, 1);
  assert.equal(town.version, 4);
  assert.deepEqual(
    (await f.store.get(base + "/town_details/town")).registeredResidents,
    ["Actor"],
  );
  assert.equal(
    (await f.store.list(base + "/audit"))[0].action,
    "player.removed",
  );
});
test("self-removal, Operator protection, stale permissions and exact confirmation are enforced", async () => {
  const f = await fixture("leader");
  await assert.rejects(
    f.service.removeUser(f.actor, "actor", { confirmName: "Actor" }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.service.removeUser(f.actor, "target", { confirmName: "target" }),
    (e) => e.status === 400,
  );
  await f.store.set("users/target", { ...f.target, roles: ["operator"] });
  await assert.rejects(
    f.service.removeUser(f.actor, "target", { confirmName: "Target" }),
    (e) => e.status === 403,
  );
  await f.store.set("users/actor", { ...f.actor, roles: ["citizen"] });
  await assert.rejects(
    f.service.removeTown(f.actor, "town", { confirmName: "Harbour" }),
    (e) => e.status === 403,
  );
  await f.store.remove("users/actor");
  await assert.rejects(
    f.service.removalTowns(f.actor),
    (e) => e.status === 403,
  );
  assert.ok(await f.store.get("users/target"));
});
test("removal HTTP routes require management access and apply typed confirmation", async (t) => {
  const f = await fixture(),
    api = createApi(f.service, { logger: { error: () => {} } });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const token = "a".repeat(43);
  await f.store.set("server_sessions/" + digest(token), {
    uid: "actor",
    expiresAt: Date.now() + 60000,
  });
  const call = (path, body) =>
    fetch(
      "http://127.0.0.1:" + api.address().port + "/api/admin/removal/" + path,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  assert.equal((await call("towns")).status, 200);
  assert.equal((await call("players")).status, 200);
  assert.equal(
    (await call("towns/town", { confirmName: "wrong" })).status,
    400,
  );
  assert.equal(
    (await call("towns/town", { confirmName: "Harbour" })).status,
    200,
  );
  assert.equal(
    (await call("players/target", { confirmName: "Target" })).status,
    200,
  );
  await f.store.set("users/actor", { ...f.actor, roles: ["admin"] });
  for (const [path, body] of [
    ["towns"],
    ["players"],
    ["towns/missing", { confirmName: "x" }],
    ["players/missing", { confirmName: "x" }],
  ])
    assert.equal((await call(path, body)).status, 403);
});
