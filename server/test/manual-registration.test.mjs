import test from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";
import { lookupManualEarthMc } from "../src/manual-registration.mjs";
import { memoryStore } from "./memory-store.mjs";
import { fixtureSnapshot } from "./registration-fixture.mjs";
const base = "nations/byzantium",
  townId = "2".repeat(32),
  mayorId = "1".repeat(32);
const mayor = () => ({
  ...fixtureSnapshot("Mayor"),
  minecraftUuid: mayorId,
  town: {
    name: "ExampleTown",
    uuid: townId,
    mayorUuid: mayorId,
    mayorName: "Mayor",
  },
  roles: ["citizen", "mayor"],
});
const citizen = () => ({
  ...mayor(),
  username: "Citizen",
  minecraftUuid: "3".repeat(32),
  isMayor: false,
  roles: ["citizen"],
  townBalance: null,
});
async function setup() {
  const store = memoryStore();
  let time = Date.now(),
    changed = null;
  const service = createService(store, {
    now: () => time,
    registration: {
      lookup: async (name) =>
        changed || (name.toLowerCase() === "mayor" ? mayor() : citizen()),
    },
  });
  const actor = {
    uid: "operator",
    username: "Reviewer",
    authType: "records",
    nation: "byzantium",
    status: "approved",
    role: "operator",
    roles: ["operator"],
  };
  await store.set("users/operator", actor);
  const register = async (name) => {
    const checked = await service.manualLookup(
      { username: name },
      "lookup-" + name,
    );
    return service.register(
      {
        username: checked.profile.username,
        receipt: checked.receipt,
        confirmed: true,
        password: "example-password",
      },
      "register-" + name,
    );
  };
  return {
    store,
    service,
    actor,
    register,
    advance: (ms) => (time += ms),
    change: (value) => (changed = value),
  };
}
test("lookup does not create an account or town; passwords require a server receipt", async () => {
  const f = await setup();
  const check = await f.service.manualLookup({ username: "Mayor" }, "lookup");
  assert.equal(check.profile.isMayor, true);
  assert.equal((await f.store.list(base + "/towns")).length, 0);
  await assert.rejects(
    f.service.register(
      { username: "Mayor", password: "example-password", roles: ["operator"] },
      "bad",
    ),
    (e) => e.status === 400,
  );
  const result = await f.service.register(
    {
      username: "Mayor",
      receipt: check.receipt,
      confirmed: true,
      password: "example-password",
      isMayor: false,
      roles: ["operator"],
    },
    "good",
  );
  assert.equal(result.account.status, "pending");
  assert.equal(result.account.minecraftVerified, false);
  assert.deepEqual(result.account.roles, ["citizen"]);
  assert.equal((await f.store.list(base + "/towns")).length, 0);
  assert.equal(await f.store.get("minecraft_accounts/" + mayorId), null);
  assert.equal(JSON.stringify(result).includes("example-password"), false);
  assert.ok(
    (await f.store.get("server_credentials/" + result.account.uid)).hash,
  );
});
test("mayor approval creates the town and resident, citizen approval waits until then", async () => {
  const f = await setup(),
    c = await f.register("Citizen"),
    m = await f.register("Mayor");
  const pending = await f.service.me(await f.service.authenticate(c.token));
  assert.equal(pending.account.registrationReady, false);
  await assert.rejects(f.service.approve(f.actor, c.account.uid), /wait until/);
  await assert.rejects(
    f.service.updateUser(f.actor, c.account.uid, { status: "approved" }),
    /wait until/,
  );
  assert.equal((await f.store.get("users/" + c.account.uid)).status, "pending");
  await f.service.approve(f.actor, m.account.uid);
  const id = "emc-" + townId;
  assert.equal(
    (await f.store.get(base + "/towns/" + id)).mayorUid,
    m.account.uid,
  );
  assert.deepEqual(
    (await f.store.get(base + "/town_details/" + id)).registeredResidents,
    ["Mayor"],
  );
  assert.equal(
    (await f.service.me(await f.service.authenticate(c.token))).account
      .registrationReady,
    true,
  );
  await f.service.updateUser(f.actor, c.account.uid, { status: "approved" });
  assert.deepEqual(
    (await f.store.get(base + "/town_details/" + id)).registeredResidents,
    ["Mayor", "Citizen"],
  );
  assert.equal((await f.store.get("users/" + c.account.uid)).townId, id);
  assert.equal((await f.store.get(base + "/towns/" + id)).recordsResidents, 2);
  assert.equal(
    (await f.store.get("users/" + m.account.uid)).minecraftVerified,
    false,
  );
  assert.equal(
    (await f.store.get("users/" + m.account.uid)).emcIdentityReviewed,
    true,
  );
});
test("a registered town with an unapproved mayor does not unlock citizen approval", async () => {
  const f = await setup(),
    c = await f.register("Citizen"),
    m = await f.register("Mayor"),
    id = "manual-town";
  await f.store.set(
    base + "/town_names/" + Buffer.from("exampletown").toString("base64url"),
    { id },
  );
  await f.store.set(base + "/towns/" + id, {
    id,
    name: "ExampleTown",
    mayorUid: m.account.uid,
    earthmcUuid: townId,
  });
  await assert.rejects(f.service.approve(f.actor, c.account.uid), /wait until/);
});
test("receipts expire, are single-use and cannot be used with a different username", async () => {
  const f = await setup(),
    checked = await f.service.manualLookup({ username: "Mayor" }, "check");
  await assert.rejects(
    f.service.register(
      {
        username: "Wrong",
        password: "example-password",
        confirmed: true,
        receipt: checked.receipt,
      },
      "wrong",
    ),
    (e) => e.status === 409,
  );
  f.advance(11 * 60000);
  await assert.rejects(
    f.service.register(
      {
        username: "Mayor",
        password: "example-password",
        confirmed: true,
        receipt: checked.receipt,
      },
      "old",
    ),
    (e) => e.status === 410,
  );
  const fresh = await f.service.manualLookup({ username: "Mayor" }, "fresh");
  const body = {
    username: "Mayor",
    password: "example-password",
    confirmed: true,
    receipt: fresh.receipt,
  };
  const concurrent = await Promise.allSettled([
    f.service.register(body, "one"),
    f.service.register(body, "two"),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("server_credentials")).length, 1);
});
test("identity and town changes must be reconfirmed and old credentials are not changed", async () => {
  const f = await setup(),
    checked = await f.service.manualLookup({ username: "Mayor" }, "check");
  f.change({
    ...mayor(),
    town: { ...mayor().town, name: "NewTown", uuid: "4".repeat(32) },
  });
  await assert.rejects(
    f.service.register(
      {
        username: "Mayor",
        password: "example-password",
        confirmed: true,
        receipt: checked.receipt,
      },
      "new",
    ),
    /changed/,
  );
  assert.equal((await f.store.list("server_credentials")).length, 0);
});
test("unknown and government ranks wait for senior rank review rather than granting privileges", async () => {
  const f = await setup();
  f.change({
    ...mayor(),
    roles: ["citizen", "mayor", "leader"],
    ranks: ["King"],
  });
  const user = await f.register("Mayor");
  await f.service.approve(f.actor, user.account.uid);
  const profile = await f.store.get("users/" + user.account.uid);
  assert.deepEqual(profile.roles, ["citizen", "mayor"]);
  const reviews = await f.service.rankReviews(f.actor);
  assert.equal(reviews.length, 1);
  assert.ok(reviews[0].unknownRanks.some((r) => r.rank === "leader"));
});
test("suspended reviewers and conflicting town owners cannot create a town or approve", async () => {
  const f = await setup(),
    m = await f.register("Mayor");
  await f.store.set("users/operator", { ...f.actor, status: "suspended" });
  await assert.rejects(
    f.service.approve(f.actor, m.account.uid),
    (e) => e.status === 403,
  );
  assert.equal((await f.store.list(base + "/towns")).length, 0);
  await f.store.set("users/operator", f.actor);
  const id = "occupied";
  await f.store.set(
    base + "/town_names/" + Buffer.from("exampletown").toString("base64url"),
    { id },
  );
  await f.store.set(base + "/towns/" + id, {
    id,
    mayorUid: "different",
    earthmcUuid: townId,
  });
  await assert.rejects(
    f.service.approve(f.actor, m.account.uid),
    /already has/,
  );
  assert.equal((await f.store.get("users/" + m.account.uid)).status, "pending");
});
test("EMC missing profiles and network outages are different errors", async () => {
  await assert.rejects(
    lookupManualEarthMc("Missing", {
      fetchImpl: async () => ({ status: 404, ok: false }),
    }),
    (e) => e.status === 422 && /does not exist/.test(e.message),
  );
  await assert.rejects(
    lookupManualEarthMc("Offline", {
      fetchImpl: async () => {
        throw Error("offline");
      },
    }),
    (e) => e.status === 503,
  );
});
test("EMC profile lookup confirms the player, mayor and town by UUID", async () => {
  const player = {
    name: "Mayor",
    uuid: mayorId,
    nation: { name: "Byzantium", uuid: "b".repeat(32) },
    town: { name: "ExampleTown", uuid: townId },
    status: { isMayor: true },
    ranks: { nationRanks: ["Knight"], townRanks: [] },
    stats: { balance: 25 },
  };
  const town = {
    name: "ExampleTown",
    uuid: townId,
    nation: player.nation,
    mayor: { name: "Mayor", uuid: mayorId },
    status: { isCapital: false },
    stats: { numResidents: 5, numTownBlocks: 20, balance: 70 },
  };
  const result = await lookupManualEarthMc("mAyOr", {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith("/players") ? [player] : [town]),
    }),
  });
  assert.equal(result.username, "Mayor");
  assert.equal(result.isMayor, true);
  assert.equal(result.townBalance, 70);
  assert.equal(result.unknownRanks[0].rank, "Knight");
});
test("town changes during review refresh the pending information without creating towns", async () => {
  const f = await setup(),
    m = await f.register("Mayor"),
    next = {
      ...mayor(),
      town: { ...mayor().town, name: "NewTown", uuid: "4".repeat(32) },
    };
  f.change(next);
  await assert.rejects(
    f.service.approve(f.actor, m.account.uid),
    /Updated information/,
  );
  assert.equal(
    (await f.store.get("users/" + m.account.uid)).registration.town.name,
    "NewTown",
  );
  assert.equal((await f.store.list(base + "/towns")).length, 0);
  await f.service.approve(f.actor, m.account.uid);
  assert.equal((await f.store.list(base + "/towns"))[0].name, "NewTown");
});
test("a suspended town mayor blocks citizen approval even after the town was registered", async () => {
  const f = await setup(),
    m = await f.register("Mayor");
  await f.service.approve(f.actor, m.account.uid);
  const c = await f.register("Citizen"),
    owner = await f.store.get("users/" + m.account.uid);
  await f.store.set("users/" + owner.uid, { ...owner, status: "suspended" });
  await assert.rejects(f.service.approve(f.actor, c.account.uid), /wait until/);
});
test("a forged direct HTTP registration cannot skip EMC confirmation", async (t) => {
  const { createApi } = await import("../src/http.mjs");
  const f = await setup(),
    api = createApi(f.service);
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const post = async (path, body) =>
    fetch("http://127.0.0.1:" + api.address().port + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await post("/api/auth/register", {
        username: "Mayor",
        password: "example-password",
      })
    ).status,
    400,
  );
  const confirmation = await (
    await post("/api/auth/register/lookup", { username: "Mayor" })
  ).json();
  assert.ok(confirmation.receipt);
  assert.equal(confirmation.profile.isMayor, true);
  assert.equal(
    (
      await post("/api/auth/register", {
        username: "Mayor",
        password: "example-password",
        confirmed: true,
        receipt: confirmation.receipt,
      })
    ).status,
    201,
  );
});
test("pending users may recheck their own EMC profile but cannot recheck someone else's", async () => {
  const f = await setup(),
    m = await f.register("Mayor"),
    c = await f.register("Citizen");
  const profile = await f.service.authenticate(c.token);
  await assert.rejects(
    f.service.manualRecheck(profile, { uid: m.account.uid }),
    (e) => e.status === 403,
  );
  f.change({
    ...citizen(),
    town: { ...citizen().town, name: "ChangedTown", uuid: "4".repeat(32) },
  });
  await f.service.manualRecheck(profile, {});
  assert.equal(
    (await f.store.get("users/" + c.account.uid)).registration.town.name,
    "ChangedTown",
  );
  assert.equal((await f.store.list(base + "/towns")).length, 0);
});
test("pending manual accounts cannot use Microsoft linking to skip their review", async () => {
  const f = await setup(),
    c = await f.register("Citizen");
  await assert.rejects(
    f.service.microsoftStart({ mode: "link" }, c.token, "link"),
    (e) => e.status === 409 && /reviewed/.test(e.message),
  );
});
test("automatic mayor approval cannot create a second capital", async () => {
  const f = await setup();
  f.change({ ...mayor(), isCapital: true });
  const m = await f.register("Mayor");
  await f.store.set(base + "/town_settings/capital", {
    id: "existing",
    name: "ExistingCapital",
  });
  await assert.rejects(f.service.approve(f.actor, m.account.uid), /capital/);
  assert.equal((await f.store.get("users/" + m.account.uid)).status, "pending");
  assert.equal((await f.store.list(base + "/towns")).length, 0);
});
