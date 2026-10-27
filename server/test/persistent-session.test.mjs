import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "./registration-fixture.mjs";
import { memoryStore } from "./memory-store.mjs";
import { digest } from "../src/security.mjs";
async function setup() {
  const store = memoryStore();
  let time = 1000;
  const service = createService(store, { now: () => time });
  const user = await service.register(
    { username: "PersistentPlayer", password: "test-password" },
    "registration",
  );
  return {
    store,
    service,
    user,
    advance: (amount) => {
      time += amount;
    },
  };
}
test("desktop password sign-in survives the web timeout and ends on explicit logout", async () => {
  const f = await setup();
  const desktop = await f.service.login(
    {
      username: "PersistentPlayer",
      password: "test-password",
      rememberSession: true,
    },
    "desktop",
  );
  const record = await f.store.get("server_sessions/" + digest(desktop.token));
  assert.equal(record.persistent, true);
  assert.equal(record.expiresAt, null);
  f.advance(365 * 24 * 60 * 60 * 1000);
  assert.equal(
    (await f.service.authenticate(desktop.token)).uid,
    f.user.account.uid,
  );
  await f.service.logout(desktop.token);
  await assert.rejects(
    f.service.authenticate(desktop.token),
    (error) => error.status === 401,
  );
});
test("web sign-in and nonboolean remember options keep the existing expiry", async () => {
  const f = await setup();
  const web = await f.service.login(
    { username: "PersistentPlayer", password: "test-password" },
    "web",
  );
  const malformed = await f.service.login(
    {
      username: "PersistentPlayer",
      password: "test-password",
      rememberSession: "true",
    },
    "web-2",
  );
  f.advance(12 * 60 * 60 * 1000 + 1);
  for (const token of [web.token, malformed.token])
    await assert.rejects(
      f.service.authenticate(token),
      (error) => error.status === 401,
    );
});
test("remembered registration sessions still obey account disabling and revocation", async () => {
  const f = await setup();
  const user = await f.service.register(
    {
      username: "RememberedMayor",
      password: "test-password",
      rememberSession: true,
    },
    "registration-2",
  );
  f.advance(13 * 60 * 60 * 1000);
  assert.equal(
    (await f.service.authenticate(user.token)).uid,
    user.account.uid,
  );
  const path = "users/" + user.account.uid,
    profile = await f.store.get(path);
  await f.store.set(path, { ...profile, status: "disabled" });
  await assert.rejects(
    f.service.authenticate(user.token),
    (error) => error.status === 401,
  );
  await f.store.set(path, { ...profile, authVersion: 1 });
  await assert.rejects(
    f.service.authenticate(user.token),
    (error) => error.status === 401,
  );
});
