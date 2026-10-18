import { test } from "node:test";
import assert from "node:assert/strict";
import { createEarthMcDirectory } from "../src/earthmc-directory.mjs";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  n = "33333333-3333-4333-8333-333333333333",
  viewer = { authType: "records", nation: "byzantium", status: "pending" };
function fixture() {
  let calls = [],
    time = 1000;
  const service = createEarthMcDirectory({
    now: () => time,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const ids = options.body ? JSON.parse(options.body).query : null;
      const data = url.endsWith("/nations")
        ? ids
          ? [
              {
                name: "OtherNation",
                uuid: n,
                residents: [
                  { name: "OtherPlayer", uuid: b },
                  {
                    name: "PrivatePlayer",
                    uuid: "44444444-4444-4444-8444-444444444444",
                  },
                ],
              },
            ]
          : [{ name: "OtherNation", uuid: n }]
        : ids
          ? [
              {
                name: "OtherPlayer",
                uuid: b,
                nation: { name: "OtherNation", uuid: n },
                friends: [{ name: "PublicFriend", uuid: a }],
                perms: { build: [true, false, true, false] },
                stats: { balance: 25 },
                discord: "public-link",
              },
            ]
          : [
              { name: "TRPUnrelatedPlayer", uuid: a },
              { name: "OtherPlayer", uuid: b },
            ];
      return { ok: true, json: async () => data };
    },
  });
  return { service, calls, advance: () => (time += 60001) };
}
test("EarthMC directory includes public players independently of TRP records and caches upstream lists", async () => {
  const f = fixture();
  const result = await f.service.earthmcDirectory(viewer);
  assert.equal(result.players.length, 2);
  assert.equal(result.nations[0].name, "OtherNation");
  await f.service.earthmcDirectory(viewer);
  assert.equal(f.calls.length, 2);
  f.advance();
  await f.service.earthmcDirectory(viewer);
  assert.equal(f.calls.length, 4);
});
test("nation filter uses EarthMC membership and excludes opted-out players absent from public directory", async () => {
  const f = fixture();
  const result = await f.service.earthmcNationPlayers(viewer, n);
  assert.deepEqual(result.players, [{ name: "OtherPlayer", uuid: b }]);
  assert.equal(
    f.calls.find((item) => item.url.endsWith("/nations")).options.body,
    JSON.stringify({ query: [n] }),
  );
});
test("player detail preserves every public field including friends and permissions without TRP lookup", async () => {
  const f = fixture();
  const result = await f.service.earthmcPlayer(viewer, b);
  assert.equal(result.player.discord, "public-link");
  assert.deepEqual(result.player.perms.build, [true, false, true, false]);
  assert.equal(result.player.nation.name, "OtherNation");
  assert.equal(result.player.friends.length, 1);
  assert.equal(f.calls.length, 1);
});
test("invalid IDs and unauthorized viewers cannot call upstream", async () => {
  const f = fixture();
  for (const invalid of ["../users", "https://evil.test", ""])
    await assert.rejects(
      f.service.earthmcPlayer(viewer, invalid),
      (error) => error.status === 400,
    );
  for (const profile of [
    null,
    { ...viewer, status: "suspended" },
    { ...viewer, nation: "other" },
  ])
    await assert.rejects(
      f.service.earthmcDirectory(profile),
      (error) => error.status === 403,
    );
  assert.equal(f.calls.length, 0);
});
test("unknown player and unknown nation return clear missing states", async () => {
  const f = createEarthMcDirectory({
    fetchImpl: async () => ({ ok: true, json: async () => [] }),
  });
  await assert.rejects(
    f.earthmcPlayer(viewer, a),
    (error) => error.status === 404,
  );
  await assert.rejects(
    f.earthmcNationPlayers(viewer, n),
    (error) => error.status === 404,
  );
});
test("upstream errors and invalid payloads are safely reported", async () => {
  for (const fetchImpl of [
    async () => {
      throw Error("private transport data");
    },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ invalid: true }) }),
  ]) {
    const f = createEarthMcDirectory({ fetchImpl });
    await assert.rejects(
      f.earthmcDirectory(viewer),
      (error) => error.status === 503 && !error.message.includes("private"),
    );
  }
});
