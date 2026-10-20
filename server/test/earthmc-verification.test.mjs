import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapEarthMcRanks,
  earthMcConfirmation,
} from "../src/earthmc-verification.mjs";
const uuid = "123456781234123412341234567890ab",
  townUuid = "223456781234123412341234567890ab",
  nationUuid = "323456781234123412341234567890ab";
const player = () => ({
  uuid,
  name: "Player",
  nation: { name: "Byzantium", uuid: nationUuid },
  town: { name: "Capital", uuid: townUuid },
  status: { isMayor: false, isKing: false },
  ranks: { nationRanks: [], townRanks: [] },
  stats: { balance: 250 },
});
const town = () => ({
  uuid: townUuid,
  name: "Capital",
  nation: { name: "Byzantium", uuid: nationUuid },
  mayor: { uuid: "423456781234123412341234567890ab" },
  stats: { balance: 5000, numResidents: 12, numTownBlocks: 128 },
});
test("multiple exact nation ranks map; unknown and town-government labels never auto-elevate", () => {
  const p = player();
  p.ranks = {
    nationRanks: ["Prime Minister", "Army", "Knight", "Operator"],
    townRanks: ["Minister"],
  };
  const result = mapEarthMcRanks(p, town());
  assert.deepEqual(result.roles, ["citizen", "prime_minister", "army"]);
  assert.deepEqual(
    result.unknown.map((item) => [item.rank, item.source]),
    [
      ["Knight", "nation"],
      ["Operator", "nation"],
      ["Minister", "town"],
    ],
  );
  assert.ok(result.unknown.every((item) => item.key.length === 64));
});
test("king flag grants Leader; mayor requires matching town ownership, title alone grants neither", () => {
  const p = player();
  p.title = "<rainbow>King";
  assert.deepEqual(mapEarthMcRanks(p, town()).roles, ["citizen"]);
  p.status.isKing = true;
  assert.deepEqual(mapEarthMcRanks(p, town()).roles, ["citizen", "leader"]);
  assert.equal(mapEarthMcRanks(p, town()).unknown.length, 0);
  p.status.isMayor = true;
  assert.equal(mapEarthMcRanks(p, town()).mayor, false);
  assert.equal(mapEarthMcRanks(p, { ...town(), mayor: { uuid } }).mayor, true);
});
test("private confirmation uses fixed upstream URLs, validated identity and conditional town balance", async () => {
  const calls = [],
    fetcher = async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify([url.endsWith("/players") ? player() : town()]),
      );
    };
  const result = await earthMcConfirmation(
    { uuid, username: "Player" },
    { fetcher },
  );
  assert.equal(result.balance, 250);
  assert.equal(result.townBalance, null);
  assert.equal(result.town.name, "Capital");
  assert.equal(result.earthmcResidents, 12);
  assert.deepEqual(
    calls.map((item) => item.url),
    ["https://api.earthmc.net/v4/players", "https://api.earthmc.net/v4/towns"],
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), { query: ["12345678-1234-1234-1234-1234567890ab"] });
  assert.equal("discord" in result, false);
  const mayor = player();
  mayor.status.isMayor = true;
  const confirmed = await earthMcConfirmation(
    { uuid, username: "Player" },
    {
      fetcher: async (url) =>
        new Response(
          JSON.stringify([
            url.endsWith("/players") ? mayor : { ...town(), mayor: { uuid } },
          ]),
        ),
    },
  );
  assert.equal(confirmed.townBalance, 5000);
});
test("missing, opted out, foreign, inconsistent and unavailable records never become verified", async () => {
  await assert.rejects(
    earthMcConfirmation({ uuid: "fake", username: "Fake" }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    earthMcConfirmation(
      { uuid, username: "Player" },
      { fetcher: async () => new Response("[]") },
    ),
    (error) => error.status === 422,
  );
  await assert.rejects(
    earthMcConfirmation(
      { uuid, username: "Player" },
      {
        fetcher: async () => {
          throw Error("offline");
        },
      },
    ),
    (error) => error.status === 503,
  );
  const foreign = player();
  foreign.nation.name = "Other";
  await assert.rejects(
    earthMcConfirmation(
      { uuid, username: "Player" },
      { fetcher: async () => new Response(JSON.stringify([foreign])) },
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    earthMcConfirmation(
      { uuid, username: "Player" },
      {
        fetcher: async (url) =>
          new Response(
            JSON.stringify([
              url.endsWith("/players")
                ? player()
                : {
                    ...town(),
                    nation: { uuid: "523456781234123412341234567890ab" },
                  },
            ]),
          ),
      },
    ),
    (error) => error.status === 503,
  );
});
test("missing balances remain unavailable instead of invented zeroes", async () => {
  const p = player();
  p.stats = {};
  const result = await earthMcConfirmation(
    { uuid, username: "Player" },
    {
      fetcher: async (url) =>
        new Response(JSON.stringify([url.endsWith("/players") ? p : town()])),
    },
  );
  assert.equal(result.balance, null);
});
