import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";
import { memoryStore } from "./memory-store.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
const base = "nations/byzantium";
async function fixture() {
  const store = memoryStore(),
    service = createService(store),
    viewer = {
      uid: "viewer",
      username: "Viewer",
      nation: "byzantium",
      authType: "records",
      status: "pending",
      role: "member",
    };
  const user = {
    uid: "mayor",
    username: "Mayor",
    nation: "byzantium",
    authType: "records",
    status: "approved",
    role: "member",
    roles: ["minister", "mayor"],
    createdAt: "2026-10-17T10:00:00.000Z",
    password: "old-secret",
    hash: "private",
    email: "private@example.invalid",
    discordId: "private",
    approvedBy: "operator",
  };
  await store.set("users/viewer", viewer);
  await store.set("users/mayor", user);
  await store.set(base + "/towns/capital", {
    id: "capital",
    name: "Capital",
    mayorUid: "mayor",
    privateField: "hidden",
  });
  await store.set(base + "/town_details/capital", {
    registeredResidents: ["MAYOR", "Resident"],
    privateField: "hidden",
  });
  return { store, service, viewer, user };
}
test("pending viewers see approved citizens only and no credential or administrative fields", async () => {
  const f = await fixture();
  for (const [uid, overrides] of [
    ["rejected", { status: "rejected" }],
    ["suspended", { status: "suspended" }],
    ["foreign", { nation: "other" }],
    ["legacy", { authType: "anonymous" }],
  ])
    await f.store.set("users/" + uid, { ...f.user, uid, ...overrides });
  const list = await f.service.citizens(f.viewer);
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), [
    "joinedAt",
    "roles",
    "towns",
    "uid",
    "username",
  ]);
  assert.deepEqual(list[0].roles, ["minister", "mayor"]);
  assert.deepEqual(list[0].towns, [
    { id: "capital", name: "Capital", mayor: true },
  ]);
  assert.equal(list[0].joinedAt, f.user.createdAt);
  assert.equal(JSON.stringify(list).includes("private"), false);
  assert.equal(JSON.stringify(list).includes("old-secret"), false);
});
test("resident affiliations use registered data, legacy members display Citizen, sorting is stable", async () => {
  const f = await fixture();
  await f.store.set("users/resident", {
    ...f.user,
    uid: "resident",
    username: "Resident",
    role: "member",
    roles: undefined,
    createdAt: "invalid",
  });
  const result = await f.service.citizens(f.viewer);
  assert.deepEqual(
    result.map((user) => user.username),
    ["Mayor", "Resident"],
  );
  assert.deepEqual(result[1].roles, ["citizen"]);
  assert.equal(result[1].joinedAt, null);
  assert.deepEqual(result[1].towns, [
    { id: "capital", name: "Capital", mayor: false },
  ]);
});
test("profiles are read-only public projections and hide pending, foreign and removed users", async () => {
  const f = await fixture();
  assert.equal((await f.service.citizen(f.viewer, "mayor")).username, "Mayor");
  for (const uid of ["viewer", "missing"])
    await assert.rejects(
      f.service.citizen(f.viewer, uid),
      (error) => error.status === 404,
    );
  await assert.rejects(
    f.service.citizen(f.viewer, "../users"),
    (error) => error.status === 400,
  );
  await f.store.set("users/mayor", { ...f.user, status: "suspended" });
  await assert.rejects(
    f.service.citizen(f.viewer, "mayor"),
    (error) => error.status === 404,
  );
});
test("directory rejects suspended or foreign viewers without widening administrative access", async () => {
  const f = await fixture();
  for (const overrides of [
    { status: "suspended" },
    { nation: "other" },
    { authType: "anonymous" },
  ])
    await assert.rejects(
      f.service.citizens({ ...f.viewer, ...overrides }),
      (error) => error.status === 403,
    );
  await assert.rejects(
    f.service.adminUsers(f.viewer),
    (error) => error.status === 403,
  );
});
test("citizen HTTP endpoints require sign-in, support pending browsing, and reject writes", async (t) => {
  const f = await fixture(),
    api = createApi(f.service, { logger: { error: () => {} } });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const token = "x".repeat(43);
  await f.store.set("server_sessions/" + digest(token), {
    uid: f.viewer.uid,
    expiresAt: Date.now() + 60000,
  });
  const url = "http://127.0.0.1:" + api.address().port;
  assert.equal((await fetch(url + "/api/citizens")).status, 401);
  for (const path of ["/api/citizens", "/api/citizens/mayor"]) {
    const result = await fetch(url + path, {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal("password" in (Array.isArray(data) ? data[0] : data), false);
  }
  assert.equal(
    (
      await fetch(url + "/api/citizens/mayor", {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roles: ["operator"] }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(url + "/api/towns/capital", {
        headers: { Authorization: "Bearer " + token },
      })
    ).status,
    403,
  );
});
