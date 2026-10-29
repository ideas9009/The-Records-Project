import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";
import {
  createTownSuggestions,
  borderChunks,
  overclaimReason,
} from "../src/town-suggestions.mjs";
import { memoryStore } from "./memory-store.mjs";
const time = 1800000000000;
const own = {
  uuid: "own",
  name: "Example",
  coordinates: {
    homeBlock: [-1, 0],
    townBlocks: [[-1, 0]],
    spawn: { world: "earth" },
  },
  stats: { numTownBlocks: 1, maxTownBlocks: 20, balance: 100 },
  timestamps: { registered: time - 40 * 86400000 },
  nation: { uuid: "nation" },
};
const target = {
  uuid: "target",
  name: "Nearby",
  stats: { numTownBlocks: 13, maxTownBlocks: 12 },
  coordinates: {
    homeBlock: [0, 0],
    townBlocks: Array.from({ length: 13 }, (_, x) => [x, 0]),
  },
  status: { isOverClaimed: true, hasOverclaimShield: false },
  nation: { uuid: "other" },
};
test("border scan excludes owned chunks, deduplicates shared edges and supports negative coordinates", () => {
  const result = borderChunks(
    [
      [-1, 0],
      [0, 0],
    ],
    [-1, 0],
  );
  assert.equal(result.total, 6);
  assert(!result.points.some(([x, z]) => (x === -1 || x === 0) && z === 0));
  assert.equal(
    borderChunks(own.coordinates.townBlocks, [-1, 0], 2).points.length,
    2,
  );
});
test("overclaim checks reject homeblocks, shields, bridges, missing layouts and young towns", () => {
  assert.equal(overclaimReason(own, target, [12, 0], time), null);
  assert.match(overclaimReason(own, target, [0, 0], time), /homeblock/);
  assert.match(overclaimReason(own, target, [6, 0], time), /split/);
  assert.match(
    overclaimReason(
      own,
      { ...target, status: { ...target.status, hasOverclaimShield: true } },
      [12, 0],
      time,
    ),
    /shield/,
  );
  assert.match(
    overclaimReason({ ...own, timestamps: {} }, target, [12, 0], time),
    /30 days/,
  );
  assert.match(
    overclaimReason(
      own,
      { ...target, coordinates: { homeBlock: [0, 0] } },
      [12, 0],
      time,
    ),
    /complete/,
  );
  assert.match(
    overclaimReason(own, { ...target, nation: own.nation }, [12, 0], time),
    /own nation/,
  );
});
test("service enforces town ownership before fetching or serving cached suggestions, with single-flight scans", async () => {
  const store = memoryStore(),
    owner = {
      uid: "owner",
      username: "Mayor",
      authType: "records",
      status: "approved",
      nation: "byzantium",
      role: "mayor",
    },
    other = { ...owner, uid: "other" };
  await store.set("users/owner", owner);
  await store.set("users/other", other);
  await store.set("nations/byzantium/towns/town", {
    name: "Example",
    earthmcUuid: "own",
    mayorUids: ["owner"],
  });
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    const q = JSON.parse(options.body).query;
    return {
      ok: true,
      json: async () =>
        url.endsWith("/towns")
          ? [own]
          : q.map(([x, z]) => ({
              location: { x, z },
              ...(Math.floor(z / 16) < 0
                ? { isWilderness: true }
                : Math.floor(z / 16) > 0
                  ? {
                      isWilderness: false,
                      town: { uuid: "hidden", name: "Unknown" },
                    }
                  : {}),
            })),
    };
  };
  const service = createService(store, {
    now: () => time,
    earthmc: { fetchImpl },
  });
  assert.equal(typeof service.townSuggestions, "function");
  const [a, b] = await Promise.all([
    service.townSuggestions(owner, "town"),
    service.townSuggestions(owner, "town"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.cells.find((c) => c.z === -1).state, "free");
  assert.equal(a.cells.find((c) => c.x === -2).state, "unknown");
  assert.equal(a.cells.find((c) => c.z === 1).state, "blocked");
  const after = calls;
  await service.townSuggestions(owner, "town");
  assert.equal(calls, after);
  await assert.rejects(
    service.townSuggestions(other, "town"),
    (e) => e.status === 403,
  );
  assert.equal(calls, after);
  await store.set("users/owner", { ...owner, status: "disabled" });
  await assert.rejects(service.townSuggestions(owner, "town"));
  assert.equal(calls, after);
});
test("failed scans are retriable and never turn missing ownership into wilderness", async () => {
  const store = memoryStore(),
    owner = {
      uid: "a",
      username: "a",
      authType: "records",
      role: "mayor",
      status: "approved",
      nation: "byzantium",
    };
  await store.set("users/a", owner);
  await store.set("nations/byzantium/towns/t", {
    name: "Example",
    mayorUid: "a",
  });
  let fail = true;
  const service = createTownSuggestions(store, {
    now: () => time,
    fetchImpl: async (url) => ({
      ok: !fail,
      json: async () => (url.endsWith("/towns") ? [own] : []),
    }),
  });
  await assert.rejects(
    service.townSuggestions(owner, "t"),
    (e) => e.status === 503,
  );
  fail = false;
  const data = await service.townSuggestions(owner, "t");
  assert(data.cells.every((c) => c.state === "unknown"));
});

test('transient gateway failures retry and failed border batches preserve a partial scan',async()=>{
 const store=memoryStore(),profile={uid:'retry',authType:'records',nation:'byzantium',status:'approved',role:'mayor'};
 await store.set('users/retry',profile);await store.set('nations/byzantium/towns/retry',{name:'Example',mayorUid:'retry'});
 let attempts=0;const service=createTownSuggestions(store,{fetchImpl:async(url)=>{
  if(url.endsWith('/towns')){if(++attempts===1)return {ok:false,status:502};return {ok:true,json:async()=>[own]};}
  return {ok:false,status:400};
 }});
 const data=await service.townSuggestions(profile,'retry');assert.equal(attempts,2);assert.equal(data.chunks.length,1);assert(data.cells.every(c=>c.state==='unknown'));
});
