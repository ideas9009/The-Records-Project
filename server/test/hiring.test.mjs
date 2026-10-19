import { test } from "node:test";
import assert from "node:assert/strict";
import { createHiring } from "../src/hiring.mjs";
import { memoryStore } from "./memory-store.mjs";
import { createService } from "../src/service.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
const listing = {
  title: "Farm building",
  description: "Available in the evenings.",
  minGold: 10,
  maxGold: 30,
  period: "weekly",
  active: true,
  version: 0,
};
const msg = (
  message = "Hello, can you build a farm?",
  clientId = crypto.randomUUID(),
) => ({ message, clientId });
async function fixture() {
  const store = memoryStore();
  let time = Date.now();
  const service = createHiring(store, { now: () => time++ });
  const users = Object.fromEntries(
    ["worker", "employer", "other", "pending"].map((uid) => [
      uid,
      {
        uid,
        username: uid + "Name",
        status: uid === "pending" ? "pending" : "approved",
        authType: "records",
        nation: "byzantium",
        role: "citizen",
      },
    ]),
  );
  for (const user of Object.values(users))
    await store.set("users/" + user.uid, user);
  return { store, service, ...users };
}
test("availability validates Gold ranges, periods and versions, and ignores forged ownership", async () => {
  const f = await fixture();
  const saved = await f.service.availabilitySave(f.worker, {
    ...listing,
    ownerUid: "other",
    username: "Forged",
  });
  assert.equal(saved.ownerUid, "worker");
  assert.equal(saved.username, "workerName");
  assert.equal(saved.version, 1);
  await assert.rejects(
    f.service.availabilitySave(f.worker, listing),
    (e) => e.status === 409,
  );
  for (const extra of [
    { minGold: 40 },
    { minGold: -1 },
    { maxGold: Infinity },
    { period: "yearly" },
    { minGold: 0.001 },
    { active: "yes" },
    { title: "" },
  ])
    await assert.rejects(
      f.service.availabilitySave(f.other, { ...listing, ...extra }),
      (e) => e.status === 400,
    );
  await assert.rejects(
    f.service.availabilitySave(f.pending, listing),
    (e) => e.status === 403,
  );
  assert.equal((await f.service.availabilityList(f.employer)).length, 1);
  await f.service.availabilitySave(f.worker, {
    ...listing,
    active: false,
    version: 1,
  });
  assert.equal((await f.service.availabilityList(f.employer)).length, 0);
  assert.equal((await f.service.availabilityMine(f.worker)).active, false);
});
test("Hire creates a private conversation and unread inbox entry for the worker", async () => {
  const f = await fixture();
  await f.service.availabilitySave(f.worker, listing);
  const sent = await f.service.hireStart(f.employer, "worker", {
    ...msg(),
    senderUid: "other",
  });
  const chat = await f.service.hiringGet(f.worker, sent.id);
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].senderUid, "employer");
  assert.equal(chat.thread.workerUid, "worker");
  assert.equal(chat.thread.minGold, 10);
  const inbox = await f.service.hiringInbox(f.worker);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].readSeq, 0);
  assert.equal(inbox[0].lastSeq, 1);
  await f.service.hiringRead(f.worker, sent.id, { seq: 1 });
  assert.equal((await f.service.hiringInbox(f.worker))[0].readSeq, 1);
  await f.service.hiringSend(f.worker, sent.id, msg("I can help on Saturday."));
  assert.equal((await f.service.hiringInbox(f.employer))[0].lastSeq, 2);
  assert.equal((await f.service.hiringInbox(f.employer))[0].readSeq, 1);
});
test("unrelated members and administrators cannot read, send or mark someone else's hiring messages", async () => {
  const f = await fixture();
  await f.service.availabilitySave(f.worker, listing);
  const { id } = await f.service.hireStart(f.employer, "worker", msg());
  for (const roles of [["citizen"], ["admin"], ["operator"]]) {
    const user = { ...f.other, roles };
    await f.store.set("users/other", user);
    for (const call of [
      () => f.service.hiringGet(user, id),
      () => f.service.hiringSend(user, id, msg()),
      () => f.service.hiringRead(user, id, { seq: 1 }),
    ])
      await assert.rejects(call, (e) => e.status === 403);
    assert.deepEqual(await f.service.hiringInbox(user), []);
  }
});
test("requests cannot self-hire or contact paused listings and current suspension overrides stale sessions", async () => {
  const f = await fixture();
  await f.service.availabilitySave(f.worker, listing);
  await assert.rejects(
    f.service.hireStart(f.worker, "worker", msg()),
    (e) => e.status === 400,
  );
  const { id } = await f.service.hireStart(f.employer, "worker", msg());
  await f.service.availabilitySave(f.worker, {
    ...listing,
    active: false,
    version: 1,
  });
  await assert.rejects(
    f.service.hireStart(f.other, "worker", msg()),
    (e) => e.status === 409,
  );
  await f.service.hiringSend(f.worker, id, msg("Existing chats still work."));
  await f.store.set("users/worker", { ...f.worker, status: "suspended" });
  await assert.rejects(
    f.service.hiringSend(f.worker, id, msg()),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.service.hiringSend(f.employer, id, msg()),
    (e) => e.status === 403,
  );
  await f.store.set("users/employer", { ...f.employer, status: "pending" });
  await assert.rejects(
    f.service.hiringGet(f.employer, id),
    (e) => e.status === 403,
  );
});
test("duplicate sends and simultaneous hiring requests cannot duplicate messages or threads", async () => {
  const f = await fixture();
  await f.service.availabilitySave(f.worker, listing);
  const body = msg();
  const results = await Promise.all([
    f.service.hireStart(f.employer, "worker", body),
    f.service.hireStart(f.employer, "worker", body),
  ]);
  assert.equal(results[0].id, results[1].id);
  const id = results[0].id;
  assert.equal((await f.service.hiringGet(f.worker, id)).messages.length, 1);
  await Promise.all([
    f.service.hiringSend(f.worker, id, msg("One")),
    f.service.hiringSend(f.employer, id, msg("Two")),
  ]);
  assert.deepEqual(
    (await f.service.hiringGet(f.worker, id)).messages.map(
      (message) => message.seq,
    ),
    [1, 2, 3],
  );
  await f.service.hiringRead(f.worker, id, { seq: 2 });
  await f.service.hiringRead(f.worker, id, { seq: 1 });
  assert.equal((await f.service.hiringInbox(f.worker))[0].readSeq, 2);
  await assert.rejects(
    f.service.hiringRead(f.worker, id, { seq: 999 }),
    (e) => e.status === 400,
  );
});
test("message pages retain chronological order, escape rendering as text, and reject invalid input", async () => {
  const f = await fixture();
  await f.service.availabilitySave(f.worker, listing);
  const { id } = await f.service.hireStart(
    f.employer,
    "worker",
    msg("<script>untrusted text</script>"),
  );
  for (let n = 0; n < 55; n++)
    await f.service.hiringSend(f.worker, id, msg("Message " + n));
  const latest = await f.service.hiringGet(f.worker, id);
  assert.equal(latest.messages.length, 50);
  assert.equal(latest.messages[0].seq, 7);
  assert.equal(latest.hasEarlier, true);
  const previous = await f.service.hiringGet(f.worker, id, 7);
  assert.equal(previous.messages.length, 6);
  assert.equal(previous.messages[0].text, "<script>untrusted text</script>");
  assert.equal(previous.hasEarlier, false);
  for (const body of [
    msg(""),
    msg("x".repeat(3001)),
    { message: "Hello", clientId: "../bad" },
  ])
    await assert.rejects(
      f.service.hiringSend(f.worker, id, body),
      (e) => e.status === 400,
    );
  await assert.rejects(
    f.service.hiringGet(f.worker, id, NaN),
    (e) => e.status === 400,
  );
});
test("HTTP hiring routes authenticate, isolate inboxes, and support private replies", async (t) => {
  const f = await fixture(),
    service = createService(f.store),
    api = createApi(service, { logger: { error() {} } });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const tokens = {
    worker: "w".repeat(43),
    employer: "e".repeat(43),
    other: "o".repeat(43),
    pending: "p".repeat(43),
  };
  for (const [uid, token] of Object.entries(tokens))
    await f.store.set("server_sessions/" + digest(token), {
      uid,
      expiresAt: Date.now() + 60000,
    });
  const call = (uid, path, method = "GET", body) =>
    fetch("http://127.0.0.1:" + api.address().port + path, {
      method,
      headers: {
        Authorization: "Bearer " + tokens[uid],
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await call("worker", "/api/availability/mine", "PUT", listing)).status,
    200,
  );
  assert.equal((await call("pending", "/api/availability")).status, 403);
  const request = await call(
    "employer",
    "/api/availability/worker/hire",
    "POST",
    msg(),
  );
  assert.equal(request.status, 200);
  const { id } = await request.json();
  assert.equal((await call("other", "/api/hiring/" + id)).status, 403);
  assert.equal(
    (
      await call(
        "worker",
        "/api/hiring/" + id + "/messages",
        "POST",
        msg("Yes"),
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await call("employer", "/api/hiring/inbox")).json()).length,
    1,
  );
  assert.equal(
    (await (await call("other", "/api/hiring/inbox")).json()).length,
    0,
  );
});
