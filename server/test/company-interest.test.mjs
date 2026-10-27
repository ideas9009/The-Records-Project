import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";
import { COMPANY_CONTACT_UID } from "../src/company-interest.mjs";
import { memoryStore } from "./memory-store.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
async function fixture() {
  const store = memoryStore(),
    service = createService(store, { now: () => 1000 });
  const member = {
    uid: "member",
    username: "ActualPlayer",
    status: "approved",
    authType: "records",
    nation: "byzantium",
    role: "citizen",
  };
  const owner = {
    ...member,
    uid: COMPANY_CONTACT_UID,
    username: "Sumeitideas",
    role: "operator",
  };
  await store.set("users/" + member.uid, member);
  await store.set("users/" + owner.uid, owner);
  return { store, service, member, owner };
}
test("company interest sends the authenticated username only to the fixed owner inbox", async () => {
  const f = await fixture();
  const result = await f.service.requestCompanyRegistration({
    ...f.member,
    username: "ForgedName",
  });
  assert.deepEqual(result, { sent: true, alreadySent: false });
  const received = await f.service.notifications(f.owner);
  assert.equal(received.length, 1);
  assert.match(received[0].message, /ActualPlayer/);
  assert.doesNotMatch(received[0].message, /ForgedName/);
  assert.deepEqual(await f.service.notifications(f.member), []);
  assert.equal(
    [...f.store.records.keys()].filter((path) =>
      path.includes("/notifications/"),
    ).length,
    1,
  );
  assert.ok(
    ![...f.store.records.keys()].some((path) => path.startsWith("companies/")),
  );
});
test("repeated and concurrent clicks create one notification per person", async () => {
  const f = await fixture();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.service.requestCompanyRegistration(f.member),
    ),
  );
  assert.equal(results.filter((result) => !result.alreadySent).length, 1);
  assert.equal((await f.service.notifications(f.owner)).length, 1);
});
test("pending, disabled, foreign and no-longer-approved accounts cannot submit", async () => {
  const f = await fixture();
  for (const status of ["pending", "disabled", "suspended"])
    await assert.rejects(
      f.service.requestCompanyRegistration({ ...f.member, status }),
      (error) => error.status === 403,
    );
  await assert.rejects(
    f.service.requestCompanyRegistration({ ...f.member, nation: "other" }),
    (error) => error.status === 403,
  );
  await f.store.set("users/" + f.member.uid, {
    ...f.member,
    status: "disabled",
  });
  await assert.rejects(
    f.service.requestCompanyRegistration(f.member),
    (error) => error.status === 403,
  );
  assert.deepEqual(await f.service.notifications(f.owner), []);
});
test("unavailable recipient produces an error instead of pretending a request was sent", async () => {
  const f = await fixture();
  await f.store.remove("users/" + f.owner.uid);
  await assert.rejects(
    f.service.requestCompanyRegistration(f.member),
    (error) => error.status === 503,
  );
  assert.ok(
    ![...f.store.records.keys()].some((path) =>
      path.includes("/notifications/"),
    ),
  );
});
test("HTTP routes require sign-in, ignore recipient spoofing, and keep inboxes private", async (t) => {
  const f = await fixture(),
    token = "c".repeat(43),
    ownerToken = "o".repeat(43);
  for (const [value, user] of [
    [token, f.member],
    [ownerToken, f.owner],
  ])
    await f.store.set("server_sessions/" + digest(value), {
      uid: user.uid,
      expiresAt: Date.now() + 60000,
    });
  const api = createApi(f.service);
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => api.close(resolve)));
  const url = "http://127.0.0.1:" + api.address().port,
    request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientUid: "someone-else",
        username: "Forged",
      }),
    };
  assert.equal(
    (await fetch(url + "/api/companies/registration-interest", request)).status,
    401,
  );
  assert.equal(
    (
      await fetch(url + "/api/companies/registration-interest", {
        ...request,
        headers: { ...request.headers, Authorization: "Bearer " + token },
      })
    ).status,
    200,
  );
  const own = await fetch(url + "/api/notifications?uid=" + f.owner.uid, {
    headers: { Authorization: "Bearer " + token },
  });
  assert.deepEqual(await own.json(), []);
  const recipient = await fetch(url + "/api/notifications", {
    headers: { Authorization: "Bearer " + ownerToken },
  });
  const inbox = await recipient.json();
  assert.equal(inbox.length, 1);
  assert.match(inbox[0].message, /ActualPlayer/);
});
