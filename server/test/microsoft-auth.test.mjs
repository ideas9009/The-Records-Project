import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";
import { memoryStore } from "./memory-store.mjs";
import { ApiError, digest } from "../src/security.mjs";
import { createApi } from "../src/http.mjs";
const uuid = "123456781234123412341234567890ab",
  townUuid = "223456781234123412341234567890ab";
function fixture() {
  const store = memoryStore();
  let time = Date.UTC(2026, 9, 18),
    identity = { uuid, username: "Player", skin: null },
    error = null,
    extra = {};
  const snapshot = (id) => ({
    minecraftUuid: id.uuid,
    username: id.username,
    nation: { name: "Byzantium", uuid: "323456781234123412341234567890ab" },
    town: {
      name: "Capital",
      uuid: townUuid,
      mayorUuid: "423456781234123412341234567890ab",
    },
    isMayor: false,
    roles: ["citizen"],
    unknownRanks: [],
    ranks: [],
    balance: 10,
    townBalance: null,
    earthmcResidents: 24,
    claimedChunks: 128,
    ...extra,
  });
  const provider = {
    config: () => ({ clientId: "public-id", configured: true, enabled: true }),
    authorizationUrl: (state, verifier) => {
      assert.equal(verifier.length, 43);
      return (
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?state=" +
        state
      );
    },
    exchange: async () => {
      if (error) throw error;
      return identity;
    },
  };
  const service = createService(store, {
    now: () => time,
    microsoft: { provider, confirmation: async (id) => snapshot(id) },
  });
  return {
    store,
    service,
    advance: (ms) => (time += ms),
    setIdentity: (value) => (identity = value),
    setError: (value) => (error = value),
    setExtra: (value) => (extra = value),
  };
}
async function ready(f, mode = "register", token = null) {
  const flow = await f.service.microsoftStart({ mode }, token, "test-ip");
  assert.equal(flow.id.length, 43);
  assert.equal(flow.secret.length, 43);
  assert.notEqual(flow.id, flow.secret);
  assert.equal(
    (
      await f.service.microsoftCallback(
        new URLSearchParams({ state: flow.id, code: "test-code" }),
      )
    ).ok,
    true,
  );
  const result = await f.service.microsoftPoll(flow);
  assert.equal(result.status, "ready");
  return { ...flow, confirmationDigest: result.confirmationDigest };
}
const finish = (f, flow, token = null) =>
  f.service.microsoftFinish(
    { ...flow, password: "test-password" },
    token,
    "finish-ip",
  );
test("Microsoft registration creates approved account, salted password and UUID claim without storing provider tokens", async () => {
  const f = fixture(),
    flow = await ready(f);
  assert.equal(
    (await f.service.microsoftPoll(flow)).profile.townRegistered,
    false,
  );
  const result = await finish(f, flow);
  assert.equal(result.account.status, "approved");
  assert.equal(result.account.minecraftVerified, true);
  assert.equal(
    (await f.service.authenticate(result.token)).minecraftUuid,
    uuid,
  );
  assert.equal(
    (await f.store.get("minecraft_accounts/" + uuid)).uid,
    result.account.uid,
  );
  const profile = await f.store.get("users/" + result.account.uid);
  assert.equal(profile.password, undefined);
  assert.equal(
    (await f.store.get("server_credentials/" + profile.uid)).algorithm,
    "scrypt-32768-8-3-v1",
  );
  assert.equal(await f.store.get("server_oauth/" + digest(flow.id)), null);
  assert.equal(
    (
      await f.service.login(
        { username: "Player", password: "test-password" },
        "password-ip",
      )
    ).account.uid,
    profile.uid,
  );
  assert.equal(
    (await f.service.me(profile)).account.townRegistrationPending,
    true,
  );
  assert.equal((await f.service.citizens(profile))[0].balance, undefined);
});
test("state and poll secret are independently checked; callbacks and completion are one-use", async () => {
  const f = fixture(),
    flow = await ready(f);
  await assert.rejects(
    f.service.microsoftPoll({ ...flow, secret: "x".repeat(43) }),
    (e) => e.status === 410,
  );
  await assert.rejects(
    f.service.microsoftCallback(
      new URLSearchParams({ state: flow.id, code: "replayed" }),
    ),
    (e) => e.status === 410,
  );
  await finish(f, flow);
  await assert.rejects(finish(f, flow), (e) => e.status === 410);
  await assert.rejects(
    f.service.microsoftCallback(
      new URLSearchParams(
        "state=" + flow.id + "&state=" + flow.id + "&code=test",
      ),
    ),
    (e) => e.status === 400,
  );
});
test("expired, cancelled and denied flows cannot create accounts", async () => {
  const f = fixture(),
    flow = await f.service.microsoftStart({ mode: "register" }, null, "ip");
  f.advance(600001);
  await assert.rejects(f.service.microsoftPoll(flow), (e) => e.status === 410);
  const next = await f.service.microsoftStart(
    { mode: "register" },
    null,
    "ip2",
  );
  assert.equal(
    (
      await f.service.microsoftCallback(
        new URLSearchParams({ state: next.id, error: "access_denied" }),
      )
    ).ok,
    false,
  );
  assert.equal((await f.service.microsoftPoll(next)).status, "failed");
  const last = await f.service.microsoftStart(
    { mode: "register" },
    null,
    "ip3",
  );
  await f.service.microsoftCancel(last);
  await assert.rejects(
    f.service.microsoftCallback(
      new URLSearchParams({ state: last.id, code: "code" }),
    ),
    (e) => e.status === 410,
  );
  assert.equal((await f.store.list("users")).length, 0);
});
test("upstream errors are sanitized and duplicate names never auto-link accounts", async () => {
  const f = fixture();
  f.setError(Error("SECRET-UPSTREAM-TOKEN"));
  const start = await f.service.microsoftStart(
    { mode: "register" },
    null,
    "ip",
  );
  await f.service.microsoftCallback(
    new URLSearchParams({ state: start.id, code: "code" }),
  );
  assert.equal(
    JSON.stringify(await f.service.microsoftPoll(start)).includes("SECRET"),
    false,
  );
  f.setError(null);
  await f.service.register(
    { username: "Player", password: "test-password" },
    "manual-ip",
  );
  await assert.rejects(finish(f, await ready(f)), (e) => e.status === 409);
  assert.equal((await f.store.list("minecraft_accounts")).length, 0);
});
test("existing accounts explicitly link with authenticated session and correct Minecraft identity", async () => {
  const f = fixture(),
    manual = await f.service.register(
      { username: "Player", password: "test-password" },
      "manual-ip",
    );
  await assert.rejects(
    f.service.microsoftStart({ mode: "link" }, null, "link-ip"),
    (e) => e.status === 401,
  );
  const flow = await ready(f, "link", manual.token);
  await assert.rejects(finish(f, flow, null), (e) => e.status === 401);
  const result = await finish(f, flow, manual.token);
  assert.equal(result.account.uid, manual.account.uid);
  assert.equal(result.account.status, "approved");
  assert.equal(
    (
      await f.service.microsoftFinish(
        { ...(await ready(f, "login")) },
        null,
        "login-ip",
      )
    ).account.uid,
    manual.account.uid,
  );
});
test("unlinked login, mismatched account linking and duplicate UUID registration fail closed", async () => {
  const f = fixture();
  await assert.rejects(
    finish(f, await ready(f, "login")),
    (e) => e.status === 409,
  );
  const manual = await f.service.register(
    { username: "Different", password: "test-password" },
    "manual-ip",
  );
  await assert.rejects(
    finish(f, await ready(f, "link", manual.token), manual.token),
    (e) => e.status === 409,
  );
  await finish(f, await ready(f));
  await assert.rejects(finish(f, await ready(f)), (e) => e.status === 409);
});
test("town/rank changes require a fresh confirmation before any account writes", async () => {
  const f = fixture(),
    flow = await ready(f);
  f.setExtra({ roles: ["citizen", "army"], ranks: ["Army"] });
  assert.deepEqual(await finish(f, flow), { confirmationChanged: true });
  assert.equal((await f.store.list("users")).length, 0);
  const updated = await f.service.microsoftPoll(flow);
  const result = await finish(f, {
    ...flow,
    confirmationDigest: updated.confirmationDigest,
  });
  assert.ok(result.account.roles.includes("army"));
});
test("verified mayor registers a town; awaiting citizens link automatically by EarthMC UUID", async () => {
  const f = fixture(),
    citizen = await finish(f, await ready(f)),
    profile = await f.service.authenticate(citizen.token);
  assert.equal((await f.service.citizens(profile))[0].towns.length, 0);
  f.setIdentity({
    uuid: "423456781234123412341234567890ab",
    username: "Mayor",
    skin: null,
  });
  f.setExtra({
    isMayor: true,
    roles: ["citizen", "mayor"],
    ranks: ["Mayor"],
    townBalance: 500,
  });
  const mayor = await finish(f, await ready(f));
  const towns = await f.service.towns(
    await f.service.authenticate(mayor.token),
  );
  assert.equal(towns.length, 1);
  assert.equal(towns[0].recordsResidents, 2);
  assert.equal(towns[0].mayorUid, mayor.account.uid);
  const detail = await f.service.town(profile, towns[0].id);
  assert.ok(detail.registeredResidents.includes("Player"));
  assert.equal(
    (await f.service.citizens(profile)).find((user) => user.uid === profile.uid)
      .towns[0].id,
    towns[0].id,
  );
  assert.equal(
    (await f.service.me(profile)).account.townRegistrationPending,
    false,
  );
});
test("unknown ranks queue atomically; existing town ownership is never silently replaced", async () => {
  const f = fixture(),
    rank = { key: digest("nation:Knight"), rank: "Knight", source: "nation" };
  f.setExtra({ unknownRanks: [rank], ranks: ["Knight"] });
  const result = await finish(f, await ready(f));
  assert.equal(
    (await f.store.get("nations/byzantium/rank_reviews/" + result.account.uid))
      .status,
    "pending",
  );
  const other = fixture();
  other.setExtra({ isMayor: true, roles: ["citizen", "mayor"] });
  await other.store.set(
    "nations/byzantium/town_names/" +
      Buffer.from("capital").toString("base64url"),
    { id: "existing" },
  );
  await other.store.set("nations/byzantium/towns/existing", {
    mayorUid: "someone-else",
  });
  await assert.rejects(
    finish(other, await ready(other)),
    (e) => e.status === 409,
  );
  assert.equal((await other.store.list("users")).length, 0);
});
test("Microsoft login preserves manual roles and cannot restore suspended accounts", async () => {
  const f = fixture(),
    registered = await finish(f, await ready(f)),
    stored = await f.store.get("users/" + registered.account.uid);
  await f.store.set("users/" + stored.uid, {
    ...stored,
    roles: ["operator", "minister", "mayor"],
  });
  const result = await finish(f, await ready(f, "login"));
  assert.deepEqual(result.account.roles, ["operator", "minister", "mayor"]);
  await f.store.set("users/" + stored.uid, { ...stored, status: "suspended" });
  await assert.rejects(
    finish(f, await ready(f, "login")),
    (e) => e.status === 403,
  );
});
test("concurrent submissions atomically consume one proof and create one account", async () => {
  const f = fixture(),
    flow = await ready(f),
    results = await Promise.allSettled([finish(f, flow), finish(f, flow)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("users")).length, 1);
});
test("HTTP configuration is public; callback is a plain token-free return page", async (t) => {
  const f = fixture(),
    api = createApi(f.service, { logger: { error: () => {} } });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const base = "http://127.0.0.1:" + api.address().port;
  assert.equal((await fetch(base + "/api/auth/microsoft/config")).status, 200);
  const flow = await f.service.microsoftStart(
    { mode: "register" },
    null,
    "http-ip",
  );
  const callback = await fetch(
    base + "/api/auth/microsoft/callback?state=" + flow.id + "&code=code",
  );
  assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    callback.headers.get("content-type"),
    "text/html; charset=utf-8",
  );
  assert.ok(!(await callback.text()).includes(flow.secret));
  const poll = await fetch(base + "/api/auth/microsoft/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flow),
  });
  assert.equal((await poll.json()).status, "ready");
});
