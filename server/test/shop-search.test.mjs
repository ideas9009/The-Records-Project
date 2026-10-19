import { test } from "node:test";
import assert from "node:assert/strict";
import { createShopSearch } from "../src/shop-search.mjs";
import { memoryStore } from "./memory-store.mjs";
import { createService } from "../src/service.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
const shop = {
  kind: "shop",
  title: "Town market",
  town: "Isthmia",
  items: ["64x Spruce Logs"],
  shopType: "market",
  description: "At spawn",
};
async function fixture() {
  const store = memoryStore(),
    service = createShopSearch(store);
  let users = {};
  for (const uid of ["owner", "other", "pending"]) {
    const user = {
      uid,
      username: uid + "Name",
      authType: "records",
      nation: "byzantium",
      status: uid === "pending" ? "pending" : "approved",
      role: "citizen",
    };
    users[uid] = user;
    await store.set("users/" + uid, user);
  }
  return { store, service, ...users };
}
test("shops and bulk enforce current approval, ownership and optimistic versions", async () => {
  const f = await fixture(),
    s = f.service;
  let item = await s.shopSearchSave(f.owner, {
    ...shop,
    ownerUid: "other",
    username: "Forged",
  });
  assert.equal(item.ownerUid, "owner");
  assert.equal(item.username, "ownerName");
  assert.equal((await s.shopSearchList(f.pending)).length, 1);
  await assert.rejects(
    s.shopSearchGet(f.pending, item.id),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.shopSearchSave(f.pending, shop),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.shopSearchSave(f.other, { ...shop, version: 1 }, item.id),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.shopSearchSave(f.owner, { ...shop, version: 0 }, item.id),
    (e) => e.status === 409,
  );
  item = await s.shopSearchSave(
    f.owner,
    { ...shop, title: "Updated market", version: 1 },
    item.id,
  );
  assert.equal(item.version, 2);
  await assert.rejects(
    s.shopSearchStatus(f.other, item.id, { active: false, version: 2 }),
    (e) => e.status === 403,
  );
  item = await s.shopSearchStatus(f.owner, item.id, {
    active: false,
    version: 2,
  });
  assert.equal((await s.shopSearchList(f.other)).length, 0);
  assert.equal((await s.shopSearchList(f.owner)).length, 1);
  await assert.rejects(
    s.shopSearchGet(f.other, item.id),
    (e) => e.status === 404,
  );
  await s.shopSearchStatus(f.owner, item.id, { active: true, version: 3 });
  assert.equal((await s.shopSearchList(f.other)).length, 1);
  await f.store.set("users/owner", { ...f.owner, status: "suspended" });
  await assert.rejects(
    s.shopSearchSave(f.owner, shop),
    (e) => e.status === 403,
  );
  await assert.rejects(s.shopSearchList(f.owner), (e) => e.status === 403);
});
test("validates item lists, shop types, command safety and bulk prices", async () => {
  const f = await fixture();
  for (const patch of [
    { title: "" },
    { town: "town\n/mail hi" },
    { town: "/t spawn town" },
    { items: [] },
    { items: ["one\ntwo"] },
    { shopType: "huge" },
  ])
    await assert.rejects(
      f.service.shopSearchSave(f.owner, { ...shop, ...patch }),
      (e) => e.status === 400,
    );
  for (const priceGold of [-1, Infinity, NaN, 0.001, "12"])
    await assert.rejects(
      f.service.shopSearchSave(f.owner, { ...shop, kind: "bulk", priceGold }),
      (e) => e.status === 400,
    );
  const bulk = await f.service.shopSearchSave(f.owner, {
    ...shop,
    kind: "bulk",
    priceGold: 12.5,
  });
  assert.equal(bulk.priceGold, 12.5);
  assert.equal(bulk.shopType, null);
});
test("HTTP listing routes require authentication and support create, edit and sold status", async (t) => {
  const f = await fixture(),
    api = createApi(createService(f.store), { logger: { error() {} } });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const token = "s".repeat(43);
  await f.store.set("server_sessions/" + digest(token), {
    uid: "owner",
    expiresAt: Date.now() + 60000,
  });
  const call = (path, method = "GET", body) =>
    fetch("http://127.0.0.1:" + api.address().port + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await fetch("http://127.0.0.1:" + api.address().port + "/api/shop-search"))
      .status,
    401,
  );
  let response = await call("/api/shop-search", "POST", shop);
  assert.equal(response.status, 200);
  let item = await response.json();
  assert.equal((await call("/api/shop-search/" + item.id)).status, 200);
  response = await call("/api/shop-search/" + item.id, "PUT", {
    ...shop,
    version: item.version,
  });
  assert.equal(response.status, 200);
  item = await response.json();
  assert.equal(
    (
      await call("/api/shop-search/" + item.id + "/status", "POST", {
        active: false,
        version: item.version,
      })
    ).status,
    200,
  );
  assert.equal((await (await call("/api/shop-search")).json()).length, 1);
});
