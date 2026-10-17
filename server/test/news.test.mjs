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
