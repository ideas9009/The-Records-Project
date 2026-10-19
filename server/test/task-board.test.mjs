import { test } from "node:test";
import assert from "node:assert/strict";
import { createTaskBoard } from "../src/task-board.mjs";
import { memoryStore } from "./memory-store.mjs";
import { createService } from "../src/service.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
const proof = "data:image/jpeg;base64,/9j/AA==";
const task = (extra) => ({
  kind: "task",
  title: "Build a sugarcane farm",
  description: "Build the farm in my town.",
  priceGold: 32.5,
  approvalRequired: false,
  ...extra,
});
const materials = (extra) => ({
  kind: "materials",
  title: "Logs for the town",
  description: "Deliver at town spawn.",
  materials: [
    { quantity: 64, name: "Spruce Logs" },
    { quantity: 32, name: "Birch Logs" },
  ],
  priceGold: 12,
  ...extra,
});
async function fixture() {
  const store = memoryStore(),
    board = createTaskBoard(store, {
      now: () => Date.parse("2026-10-19T08:00:00Z"),
    });
  const users = Object.fromEntries(
    ["owner", "worker", "other", "pending"].map((uid) => [
      uid,
      {
        uid,
        username: uid + "Name",
        authType: "records",
        nation: "byzantium",
        status: uid === "pending" ? "pending" : "approved",
        role: "citizen",
        createdAt: "2026-10-19T00:00:00Z",
      },
    ]),
  );
  for (const user of Object.values(users))
    await store.set("users/" + user.uid, user);
  return {
    store,
    board,
    ...users,
    act: (actor, listing, action, extra = {}) =>
      board.boardAct(actor, listing.id, {
        action,
        version: listing.version,
        ...extra,
      }),
  };
}
test("any approved citizen can publish; author, state and price are controlled by the server", async () => {
  const f = await fixture();
  const created = await f.board.boardCreate(
    f.owner,
    task({ ownerUid: "other", status: "completed", assigneeUid: "other" }),
  );
  assert.equal(created.ownerUid, "owner");
  assert.equal(created.status, "open");
  assert.equal(created.assigneeUid, null);
  assert.equal(created.priceGold, 32.5);
  assert.equal(created.deadline, null);
  await assert.rejects(f.board.boardCreate(f.pending, task()), { status: 403 });
  await assert.rejects(f.board.boardList(f.pending), { status: 403 });
  for (const body of [
    task({ priceGold: -1 }),
    task({ priceGold: "10" }),
    task({ priceGold: 1.111 }),
    task({ deadline: "2020-01-01" }),
    materials({ materials: [{ quantity: 0, name: "Stone" }] }),
    materials({ materials: [] }),
  ])
    await assert.rejects(f.board.boardCreate(f.owner, body), { status: 400 });
});
test("only one simultaneous direct join succeeds and owners cannot join their listings", async () => {
  const f = await fixture(),
    created = await f.board.boardCreate(f.owner, task());
  await assert.rejects(f.act(f.owner, created, "join"), { status: 400 });
  const results = await Promise.allSettled([
    f.act(f.worker, created, "join"),
    f.act(f.other, created, "join"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.find((result) => result.status === "rejected").reason.status,
    409,
  );
  assert.equal(
    (await f.board.boardGet(f.owner, created.id)).status,
    "assigned",
  );
});
test("approval mode requires an application and only the publisher can select an approved applicant", async () => {
  const f = await fixture(),
    created = await f.board.boardCreate(
      f.owner,
      task({ approvalRequired: true }),
    );
  await assert.rejects(f.act(f.worker, created, "join"), { status: 400 });
  await f.act(f.worker, created, "apply", { message: "I can build it." });
  await assert.rejects(f.act(f.worker, created, "apply"), { status: 409 });
  assert.equal(
    (await f.board.boardGet(f.other, created.id)).applications.length,
    0,
  );
  const view = await f.board.boardGet(f.owner, created.id);
  assert.equal(view.applications.length, 1);
  await assert.rejects(
    f.act(f.other, view, "approve_applicant", { candidateUid: "worker" }),
    { status: 403 },
  );
  const result = await f.act(f.owner, view, "approve_applicant", {
    candidateUid: "worker",
  });
  assert.equal(result.assigneeUid, "worker");
  assert.equal(result.agreedGold, 32.5);
});
test("screenshot, publisher approval and worker payment receipt are all required before archive", async () => {
  const f = await fixture();
  let item = await f.board.boardCreate(f.owner, task());
  item = await f.act(f.worker, item, "join");
  await assert.rejects(f.act(f.other, item, "submit", { image: proof }), {
    status: 403,
  });
  await assert.rejects(
    f.act(f.worker, item, "submit", { image: "https://example.com/fake.png" }),
    { status: 400 },
  );
  await assert.rejects(f.act(f.worker, item, "payment_received"), {
    status: 409,
  });
  item = await f.act(f.worker, item, "submit", {
    image: proof,
    message: "Finished.",
  });
  assert.equal(item.status, "submitted");
  assert.equal(item.proof.image, proof);
  await assert.rejects(f.act(f.worker, item, "approve_completion"), {
    status: 403,
  });
  item = await f.act(f.owner, item, "request_changes", {
    message: "Add lighting.",
  });
  assert.equal(item.status, "assigned");
  assert.equal(item.reviewNote, "Add lighting.");
  item = await f.act(f.worker, item, "submit", { image: proof });
  item = await f.act(f.owner, item, "approve_completion");
  assert.equal(item.status, "awaiting_payment");
  assert.equal(item.completedAt, null);
  await assert.rejects(f.act(f.owner, item, "payment_received"), {
    status: 403,
  });
  item = await f.act(f.worker, item, "payment_received");
  assert.equal(item.status, "completed");
  assert.ok(item.completedAt);
  await assert.rejects(f.act(f.worker, item, "submit", { image: proof }), {
    status: 409,
  });
  const cards = await f.board.boardList(f.owner);
  assert.equal(cards[0].proof, undefined);
});
test("private price offers and counteroffers lock the accepted price and supplier", async () => {
  const f = await fixture();
  let item = await f.board.boardCreate(f.owner, materials());
  item = await f.act(f.worker, item, "offer", {
    priceGold: 15,
    message: "Delivery included.",
  });
  assert.equal((await f.board.boardGet(f.other, item.id)).offers.length, 0);
  let view = await f.board.boardGet(f.owner, item.id),
    offer = view.offers[0];
  assert.equal(offer.priceGold, 15);
  await assert.rejects(
    f.act(f.worker, item, "accept_offer", { offerVersion: offer.version }),
    { status: 400 },
  );
  view = await f.act(f.owner, view, "counter_offer", {
    candidateUid: "worker",
    offerVersion: offer.version,
    priceGold: 13,
    message: "Can you do 13?",
  });
  await assert.rejects(
    f.act(f.worker, item, "accept_offer", { offerVersion: offer.version }),
    { status: 409 },
  );
  offer = view.offers[0];
  view = await f.act(f.worker, view, "accept_offer", {
    offerVersion: offer.version,
  });
  assert.equal(view.assigneeUid, "worker");
  assert.equal(view.agreedGold, 13);
  assert.equal(view.status, "assigned");
  await assert.rejects(f.act(f.other, view, "join"), { status: 409 });
  view = await f.act(f.worker, view, "submit", {
    message: "All logs delivered at town spawn.",
  });
  view = await f.act(f.owner, view, "approve_completion");
  view = await f.act(f.worker, view, "payment_received");
  assert.equal(view.status, "completed");
  assert.equal(view.agreedGold, 13);
});
test("material requests also allow direct provision and publisher acceptance of an offer", async () => {
  const f = await fixture();
  let item = await f.board.boardCreate(f.owner, materials());
  item = await f.act(f.worker, item, "join");
  assert.equal(item.agreedGold, 12);
  let second = await f.board.boardCreate(f.owner, materials());
  await f.act(f.worker, second, "offer", { priceGold: 10 });
  second = await f.board.boardGet(f.owner, second.id);
  second = await f.act(f.owner, second, "accept_offer", {
    candidateUid: "worker",
    offerVersion: second.offers[0].version,
  });
  assert.equal(second.agreedGold, 10);
});
test("writes re-check suspended accounts and never trust an old approved profile", async () => {
  const f = await fixture(),
    item = await f.board.boardCreate(f.owner, task());
  await f.store.set("users/worker", { ...f.worker, status: "suspended" });
  await assert.rejects(f.act(f.worker, item, "join"), { status: 403 });
  await f.store.set("users/owner", { ...f.owner, status: "suspended" });
  await assert.rejects(f.board.boardCreate(f.owner, task()), { status: 403 });
});
test("HTTP routes authenticate and restrict pending accounts, including nested action routes", async (t) => {
  const f = await fixture(),
    service = createService(f.store),
    api = createApi(service);
  const token = "a".repeat(43),
    pendingToken = "b".repeat(43);
  await f.store.set("server_sessions/" + digest(token), {
    uid: "owner",
    expiresAt: Date.now() + 60000,
  });
  await f.store.set("server_sessions/" + digest(pendingToken), {
    uid: "pending",
    expiresAt: Date.now() + 60000,
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => api.close());
  const call = (path, method = "GET", body, session = token) =>
    fetch("http://127.0.0.1:" + api.address().port + path, {
      method,
      headers: {
        Authorization: "Bearer " + session,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await call("/api/task-board", "GET", null, pendingToken)).status,
    403,
  );
  const created = await call("/api/task-board", "POST", task());
  assert.equal(created.status, 200);
  const item = await created.json();
  assert.equal((await call("/api/task-board/" + item.id)).status, 200);
  const cancelled = await call(
    "/api/task-board/" + item.id + "/actions",
    "POST",
    { action: "cancel", version: item.version },
  );
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).status, "cancelled");
});
