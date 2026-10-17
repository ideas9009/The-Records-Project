import { test } from "node:test";
import assert from "node:assert/strict";
import { createNews, newsPublisher } from "../src/news.mjs";
import { createService } from "../src/service.mjs";
import { createApi } from "../src/http.mjs";
import { memoryStore } from "./memory-store.mjs";
import { reviewer, digest } from "../src/security.mjs";
const input = (extra = {}) => ({
  title: "Town notice",
  subtitle: "A short summary",
  body: "# News\nHello **everyone**.",
  format: "discord",
  thumbnail: "",
  status: "published",
  ...extra,
});
async function fixture(role = "operator") {
  const store = memoryStore(),
    actor = {
      uid: "publisher",
      username: "Sumeitideas",
      role,
      status: "approved",
      authType: "records",
      nation: "byzantium",
    };
  await store.set("users/publisher", actor);
  let time = Date.parse("2026-10-17T12:00:00Z");
  return {
    store,
    actor,
    news: createNews(store, { now: () => time }),
    advance: (value) => {
      time += value;
    },
  };
}
for (const role of ["operator", "admin", "leader", "minister"])
  test(
    role + " can publish and author identity comes from the server",
    async () => {
      const { news, actor } = await fixture(role);
      const article = await news.newsSave(
        actor,
        input({
          author: "Forged",
          authorUid: "forged",
          createdAt: "yesterday",
        }),
      );
      assert.equal(article.author, "Sumeitideas");
      assert.equal(article.authorUid, "publisher");
      assert.equal(article.createdAt, "2026-10-17T12:00:00.000Z");
      const cards = await news.newsList(actor);
      assert.equal(cards.length, 1);
      assert.equal("body" in cards[0], false);
      assert.equal((await news.newsGet(actor, article.id)).body, input().body);
    },
  );
test("Ministers do not gain registration approval rights", async () => {
  const { actor } = await fixture("minister");
  assert.doesNotThrow(() => newsPublisher(actor));
  assert.throws(() => reviewer(actor), { status: 403 });
});
test("ordinary and pending members cannot publish or read private news", async () => {
  const { news, actor } = await fixture();
  const draft = await news.newsSave(actor, input({ status: "draft" }));
  const member = { ...actor, role: "member" };
  await assert.rejects(() => news.newsSave(member, input()), { status: 403 });
  await assert.rejects(() => news.newsList(member, true), { status: 403 });
  await assert.rejects(() => news.newsGet(member, draft.id), { status: 403 });
  await assert.rejects(() => news.newsList({ ...member, status: "pending" }), {
    status: 403,
  });
  await assert.rejects(
    () => news.newsSave({ ...actor, status: "pending" }, input()),
    { status: 403 },
  );
  assert.deepEqual(await news.newsList(member), []);
});
test("scheduled news becomes visible exactly on time without a background worker", async () => {
  const { news, actor, advance } = await fixture();
  const member = { ...actor, role: "member" };
  const article = await news.newsSave(
    actor,
    input({ status: "scheduled", publishAt: "2026-10-17T17:31:00+05:30" }),
  );
  assert.equal(article.publishAt, Date.parse("2026-10-17T12:01:00Z"));
  assert.deepEqual(await news.newsList(member), []);
  await assert.rejects(() => news.newsGet(member, article.id), { status: 403 });
  assert.equal((await news.newsGet(actor, article.id)).status, "scheduled");
  advance(59999);
  assert.deepEqual(await news.newsList(member), []);
  advance(1);
  assert.equal((await news.newsList(member))[0].id, article.id);
  assert.equal((await news.newsGet(member, article.id)).id, article.id);
  assert.equal((await news.newsList(member))[0].status, "published");
  assert.equal((await news.newsGet(member, article.id)).status, "published");
});
test("saving a draft cancels a scheduled publication and archive hides a published article", async () => {
  const { news, actor, advance } = await fixture();
  const scheduled = await news.newsSave(
    actor,
    input({ status: "scheduled", publishAt: "2026-10-17T12:01:00Z" }),
  );
  const draft = await news.newsSave(
    actor,
    input({ status: "draft", version: scheduled.version }),
    scheduled.id,
  );
  advance(120000);
  assert.deepEqual(await news.newsList(actor), []);
  const published = await news.newsSave(
    actor,
    input({ version: draft.version }),
    draft.id,
  );
  const archived = await news.newsArchive(actor, published.id, {
    version: published.version,
  });
  assert.equal(archived.status, "archived");
  assert.deepEqual(await news.newsList(actor), []);
  await assert.rejects(
    () => news.newsGet({ ...actor, role: "member" }, published.id),
    { status: 403 },
  );
  assert.equal((await news.newsList(actor, true)).length, 1);
});
test("concurrent edits are rejected and role revocation is checked during writes", async () => {
  const { store, news, actor } = await fixture();
  const article = await news.newsSave(actor, input());
  const edited = await news.newsSave(
    actor,
    input({ title: "Changed", version: 1 }),
    article.id,
  );
  assert.equal(edited.version, 2);
  assert.equal(edited.publishAt, article.publishAt);
  await assert.rejects(
    () => news.newsSave(actor, input({ version: 1 }), article.id),
    { status: 409 },
  );
  await assert.rejects(
    () => news.newsArchive(actor, article.id, { version: 1 }),
    { status: 409 },
  );
  await store.set("users/publisher", { ...actor, role: "member" });
  await assert.rejects(() => news.newsSave(actor, input()), { status: 403 });
  await assert.rejects(
    () => news.newsArchive(actor, article.id, { version: 2 }),
    { status: 403 },
  );
});
test("validation rejects malformed content, thumbnails and ambiguous or past schedules", async () => {
  const { news, actor } = await fixture();
  for (const extra of [
    { title: "" },
    { title: "x".repeat(161) },
    { subtitle: "x".repeat(301) },
    { body: " " },
    { body: "x".repeat(50001) },
    { format: "html" },
    { status: "approved" },
    { thumbnail: "https://example.com/image.jpg" },
    { status: "scheduled", publishAt: "2026-10-17T11:00:00Z" },
    { status: "scheduled", publishAt: "2026-10-18T12:00" },
    { status: "scheduled", publishAt: "bad" },
  ])
    await assert.rejects(() => news.newsSave(actor, input(extra)), {
      status: 400,
    });
});
test("HTTP news routes require sign-in, reject member writes and support publishing lifecycle", async (t) => {
  const { store, actor } = await fixture();
  const token = "a".repeat(43);
  await store.set("server_sessions/" + digest(token), {
    uid: actor.uid,
    expiresAt: Date.now() + 60000,
  });
  const api = createApi(createService(store), { logger: { error: () => {} } });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const base = "http://127.0.0.1:" + api.address().port;
  const call = (path, method = "GET", body, auth = true) =>
    fetch(base + path, {
      method,
      headers: {
        ...(auth ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call("/api/news", "GET", null, false)).status, 401);
  const response = await call("/api/news", "POST", input());
  assert.equal(response.status, 200);
  const article = await response.json();
  assert.equal(
    (await (await call("/api/news/" + article.id)).json()).title,
    "Town notice",
  );
  assert.equal((await (await call("/api/news/manage")).json()).length, 1);
  const edit = await call(
    "/api/news/" + article.id,
    "PUT",
    input({ version: 1, title: "Updated" }),
  );
  assert.equal(edit.status, 200);
  assert.equal(
    (await call("/api/news/" + article.id + "/archive", "POST", { version: 2 }))
      .status,
    200,
  );
  assert.deepEqual(await (await call("/api/news")).json(), []);
  await store.set("users/publisher", { ...actor, role: "member" });
  assert.equal((await call("/api/news", "POST", input())).status, 403);
  assert.equal((await call("/api/news/manage")).status, 403);
});

test("due article status uses server time and list responses omit bodies", async () => {
  const { news, actor, advance } = await fixture();
  const article = await news.newsSave(
    actor,
    input({ status: "scheduled", publishAt: "2026-10-17T12:01:00Z" }),
  );
  advance(60000);
  assert.equal((await news.newsGet(actor, article.id)).status, "published");
  assert.equal((await news.newsList(actor))[0].status, "published");
  const managed = (await news.newsList(actor, true))[0];
  assert.equal(managed.status, "published");
  assert.equal("body" in managed, false);
});

test("publication undo returns the article to a private draft before the 10-second boundary", async () => {
  const { news, actor, advance } = await fixture();
  const article = await news.newsSave(actor, input());
  assert.equal(article.undoRemainingMs, 10000);
  advance(9999);
  const draft = await news.newsUndo(actor, article.id, {
    version: article.version,
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.body, article.body);
  assert.deepEqual(await news.newsList(actor), []);
  await assert.rejects(
    () => news.newsGet({ ...actor, role: "member" }, article.id),
    { status: 403 },
  );
});
test("undo expires at exactly 10 seconds and edits do not renew it", async () => {
  const { news, actor, advance } = await fixture();
  const article = await news.newsSave(actor, input());
  advance(10000);
  await assert.rejects(
    () => news.newsUndo(actor, article.id, { version: article.version }),
    { status: 409 },
  );
  const edited = await news.newsSave(
    actor,
    input({ version: article.version, title: "Edited news" }),
    article.id,
  );
  assert.equal(edited.undoRemainingMs, 0);
  await assert.rejects(
    () => news.newsUndo(actor, article.id, { version: edited.version }),
    { status: 409 },
  );
});
test("undo requires the original publisher, current privileges and unchanged version", async () => {
  const { store, news, actor } = await fixture();
  const article = await news.newsSave(actor, input());
  const other = { ...actor, uid: "other", role: "minister" };
  await store.set("users/other", other);
  await assert.rejects(
    () => news.newsUndo(other, article.id, { version: article.version }),
    { status: 403 },
  );
  await assert.rejects(() => news.newsUndo(actor, article.id, { version: 0 }), {
    status: 409,
  });
  await store.set("users/publisher", { ...actor, role: "member" });
  await assert.rejects(
    () => news.newsUndo(actor, article.id, { version: article.version }),
    { status: 403 },
  );
});
test("meeting posts keep editable Google Meet links and reject disguised destinations", async () => {
  const { news, actor } = await fixture("minister");
  const article = await news.newsSave(
    actor,
    input({
      kind: "meeting",
      meetingUrl: "https://meet.google.com/aeb-wzei-sjd",
    }),
  );
  assert.equal(article.kind, "meeting");
  assert.equal(
    (await news.newsList({ ...actor, role: "member" }))[0].meetingUrl,
    "https://meet.google.com/aeb-wzei-sjd",
  );
  const edited = await news.newsSave(
    actor,
    input({
      kind: "meeting",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      version: article.version,
    }),
    article.id,
  );
  assert.equal(edited.meetingUrl, "https://meet.google.com/abc-defg-hij");
  for (const meetingUrl of [
    "javascript:alert(1)",
    "http://meet.google.com/aeb-wzei-sjd",
    "https://meet.google.com.evil.test/aeb-wzei-sjd",
    "https://meet.google.com@evil.test/aeb-wzei-sjd",
    "https://user:password@meet.google.com/aeb-wzei-sjd",
    "https://meet.google.com/",
  ])
    await assert.rejects(
      () => news.newsSave(actor, input({ kind: "meeting", meetingUrl })),
      { status: 400 },
    );
});
for (const role of ["operator", "admin", "leader", "minister"])
  test(
    role + " can read drafts and schedules while ordinary members cannot",
    async () => {
      const { news, actor } = await fixture(role);
      for (const extra of [
        { status: "draft" },
        { status: "scheduled", publishAt: "2026-10-18T12:00:00Z" },
      ]) {
        const article = await news.newsSave(actor, input(extra));
        assert.equal((await news.newsGet(actor, article.id)).id, article.id);
        await assert.rejects(
          () => news.newsGet({ ...actor, role: "member" }, article.id),
          { status: 403 },
        );
      }
      assert.equal((await news.newsList(actor, true)).length, 2);
      assert.deepEqual(await news.newsList({ ...actor, role: "member" }), []);
    },
  );
test("HTTP undo route restores a draft and rejects repeated undo", async (t) => {
  const { store, actor } = await fixture();
  const token = "b".repeat(43);
  await store.set("server_sessions/" + digest(token), {
    uid: actor.uid,
    expiresAt: Date.now() + 60000,
  });
  const api = createApi(createService(store), { logger: { error: () => {} } });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const base = "http://127.0.0.1:" + api.address().port,
    headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };
  const published = await (
    await fetch(base + "/api/news", {
      method: "POST",
      headers,
      body: JSON.stringify(input()),
    })
  ).json();
  const undo = await fetch(base + "/api/news/" + published.id + "/undo", {
    method: "POST",
    headers,
    body: JSON.stringify({ version: published.version }),
  });
  assert.equal(undo.status, 200);
  assert.equal((await undo.json()).status, "draft");
  assert.equal(
    (
      await fetch(base + "/api/news/" + published.id + "/undo", {
        method: "POST",
        headers,
        body: JSON.stringify({ version: published.version }),
      })
    ).status,
    409,
  );
});
