import { test } from "node:test";
import assert from "node:assert/strict";
import { createEarthMcProfile } from "../src/earthmc-profile.mjs";
import { createService } from "../src/service.mjs";
import { memoryStore } from "./memory-store.mjs";
test("username lookup projects public fields, strips formatting and deduplicates requests with a bounded TTL", async () => {
  let calls = 0,
    time = 1000;
  const lookup = createEarthMcProfile({
    now: () => time,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.earthmc.net/v4/players");
      assert.deepEqual(JSON.parse(options.body), { query: ["Citizen"] });
      return {
        ok: true,
        json: async () => [
          {
            name: "cItIzEn",
            about: "<red>Hello",
            stats: { balance: 0 },
            status: { isOnline: false },
            discord: "private",
            ranks: { nationRanks: ["<blue>Minister"] },
          },
        ],
      };
    },
  });
  const [a, b] = await Promise.all([lookup("Citizen"), lookup("Citizen")]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(a.balance, 0);
  assert.equal(a.online, false);
  assert.equal(a.about, "Hello");
  assert.deepEqual(a.nationRanks, ["Minister"]);
  assert.equal(a.discord, undefined);
  await lookup("Citizen");
  assert.equal(calls, 1);
  time += 60001;
  await lookup("Citizen");
  assert.equal(calls, 2);
});
test("missing players and missing fields are not fabricated, upstream errors are safe", async () => {
  const lookup = createEarthMcProfile({
    fetchImpl: async () => ({ ok: true, json: async () => [] }),
  });
  assert.equal((await lookup("Missing")).available, false);
  const minimal = createEarthMcProfile({
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ name: "Citizen" }],
    }),
  });
  const data = await minimal("Citizen");
  assert.equal(data.balance, null);
  assert.equal(data.online, null);
  assert.equal(data.lastOnline, null);
  const broken = createEarthMcProfile({
    fetchImpl: async () => {
      throw Error("secret");
    },
  });
  await assert.rejects(broken("Citizen"), /temporarily unavailable/);
  await assert.rejects(lookup("../secret"), /Invalid/);
});
test("only visible TRP citizens can be looked up and EarthMC ranks do not change app permissions", async () => {
  const store = memoryStore();
  let calls = 0;
  const service = createService(store, {
    earthmc: {
      fetchImpl: async () => {
        calls++;
        return {
          ok: true,
          json: async () => [
            {
              name: "Citizen",
              status: { isKing: true },
              ranks: { nationRanks: ["Minister"] },
            },
          ],
        };
      },
    },
  });
  const viewer = {
    uid: "viewer",
    authType: "records",
    nation: "byzantium",
    status: "pending",
  };
  await store.set("users/citizen", {
    uid: "citizen",
    username: "Citizen",
    authType: "records",
    nation: "byzantium",
    status: "approved",
    roles: ["citizen"],
  });
  await store.set("users/hidden", {
    uid: "hidden",
    username: "Hidden",
    authType: "records",
    nation: "byzantium",
    status: "pending",
  });
  await assert.rejects(service.citizenEarthMc(viewer, "hidden"), /not found/);
  assert.equal(calls, 0);
  assert.equal((await service.citizenEarthMc(viewer, "citizen")).isKing, true);
  assert.deepEqual((await store.get("users/citizen")).roles, ["citizen"]);
  await assert.rejects(
    service.citizenEarthMc({ ...viewer, status: "suspended" }, "citizen"),
    /unavailable/,
  );
});
