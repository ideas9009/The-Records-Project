import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  smartSyncSettings,
  saveSmartSyncSettings,
  setSyncIdentity,
  cacheAllowed,
  cacheEpoch,
  cachedData,
  saveCachedData,
  clearSavedData,
  savedDataStats,
  invalidateCache,
} from "../src/lib/smart-sync";
import { apiRequest, watchResource } from "../src/lib/api";
import { requestCount } from "../src/lib/request-activity";
let account = 0;
beforeEach(async () => {
  vi.stubEnv("VITE_API_URL", "");
  const local = new Map<string, string>(),
    session = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  session.set("records-server-session", "test-token");
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
    removeItem: (key: string) => session.delete(key),
  });
  const events = new EventTarget();
  vi.stubGlobal("window", {
    setInterval,
    clearInterval,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  vi.stubGlobal("fetch", vi.fn());
  setSyncIdentity(null);
  await clearSavedData();
  setSyncIdentity(
    { uid: "test-" + ++account, role: "member", status: "approved" },
    "",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const enable = () =>
  saveSmartSyncSettings({
    enabled: true,
    pages: ["towns", "news"],
    interval: 5,
  });
it("is off by default and excludes authentication, profiles, approvals, drafts and schedules", async () => {
  expect(smartSyncSettings().enabled).toBe(false);
  expect(cacheAllowed("/api/towns")).toBe(false);
  await enable();
  for (const path of [
    "/api/auth/me",
    "/api/admin/registrations",
    "/api/admin/users",
    "/api/towns/mayor-options",
    "/api/news/manage",
    "/api/preferences",
  ])
    expect(cacheAllowed(path)).toBe(false);
  await saveCachedData(
    "/api/news/draft",
    { status: "draft", body: "private" },
    cacheEpoch(),
  );
  await saveCachedData(
    "/api/news/future",
    { status: "scheduled", body: "private" },
    cacheEpoch(),
  );
  expect(await cachedData("/api/news/draft")).toBeNull();
  expect(await cachedData("/api/news/future")).toBeNull();
});
it("saves data only when enabled and clears it on opt-out", async () => {
  await enable();
  await saveCachedData("/api/towns", [{ id: "town" }], cacheEpoch());
  expect((await cachedData<any[]>("/api/towns"))?.data[0].id).toBe("town");
  await saveSmartSyncSettings({
    enabled: false,
    pages: ["towns"],
    interval: 5,
  });
  expect(await cachedData("/api/towns")).toBeNull();
  expect((await savedDataStats()).bytes).toBe(0);
});
it("never shares saved records across accounts or permission scopes", async () => {
  await enable();
  await saveCachedData("/api/towns", [{ id: "private-scope" }], cacheEpoch());
  setSyncIdentity({ uid: "another", role: "member", status: "approved" });
  expect(await cachedData("/api/towns")).toBeNull();
  setSyncIdentity({ uid: "another", role: "member", status: "pending" });
  expect(cacheAllowed("/api/news")).toBe(false);
  expect(cacheAllowed("/api/towns/test")).toBe(false);
  expect(cacheAllowed("/api/towns")).toBe(true);
});
it("expires saved copies after 24 hours", async () => {
  await enable();
  await saveCachedData("/api/towns", [], cacheEpoch());
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000 + 1);
  expect(await cachedData("/api/towns")).toBeNull();
});
it("returns saved data on network failure but never bypasses permission denials", async () => {
  await enable();
  await saveCachedData("/api/towns", [{ id: "cached" }], cacheEpoch());
  vi.mocked(fetch).mockRejectedValue(Error("offline"));
  expect(await apiRequest("/api/towns")).toEqual([{ id: "cached" }]);
  expect(requestCount()).toBe(0);
  vi.mocked(fetch).mockResolvedValue(
    new Response('{"error":"Denied"}', { status: 403 }),
  );
  await expect(apiRequest("/api/towns")).rejects.toThrow("Denied");
  expect(await cachedData("/api/towns")).toBeNull();
});
it("shows saved data before the refresh request completes and replaces it with live data", async () => {
  await enable();
  await saveCachedData("/api/towns", [{ id: "saved" }], cacheEpoch());
  let respond!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const values: unknown[] = [];
  const stop = watchResource(
    "/api/towns",
    (value) => values.push(value),
    (reason) => {
      throw reason;
    },
  );
  try {
    await vi.waitFor(() => expect(values).toEqual([[{ id: "saved" }]]));
    await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
    respond(new Response('[{"id":"live"}]', { status: 200 }));
    await vi.waitFor(() => expect(values.at(-1)).toEqual([{ id: "live" }]));
  } finally {
    stop();
  }
});
it("prevents in-flight responses from restoring data after Clear saved data", async () => {
  await enable();
  const generation = cacheEpoch();
  await clearSavedData();
  await saveCachedData("/api/towns", [{ id: "old" }], generation);
  expect(await cachedData("/api/towns")).toBeNull();
});
it("invalidates published caches after changes while reading a draft preserves the feed", async () => {
  await enable();
  const generation = cacheEpoch();
  await saveCachedData(
    "/api/news",
    [{ id: "one", status: "published" }],
    generation,
  );
  await saveCachedData("/api/news/draft", { status: "draft" }, generation);
  expect(await cachedData("/api/news")).not.toBeNull();
  await invalidateCache("/api/news/one/archive");
  expect(await cachedData("/api/news")).toBeNull();
});
it("rejects caching a news feed containing unpublished records", async () => {
  await enable();
  await saveCachedData("/api/news", [{ status: "scheduled" }], cacheEpoch());
  expect(await cachedData("/api/news")).toBeNull();
});

it("does not fall back to saved data for non-JSON permission denials", async () => {
  await enable();
  await saveCachedData(
    "/api/news",
    [{ status: "published", id: "one" }],
    cacheEpoch(),
  );
  vi.mocked(fetch).mockResolvedValue(
    new Response("Forbidden", { status: 403 }),
  );
  await expect(apiRequest("/api/news")).rejects.toThrow("invalid response");
  expect(await cachedData("/api/news")).toBeNull();
});

it("invalidates the cache when any role changes even if the primary role stays the same", async () => {
  await enable();
  setSyncIdentity({
    uid: "multi",
    role: "operator",
    roles: ["operator", "minister"],
    status: "approved",
  });
  await saveCachedData("/api/towns", [{ id: "town" }], cacheEpoch());
  expect(await cachedData("/api/towns")).not.toBeNull();
  setSyncIdentity({
    uid: "multi",
    role: "operator",
    roles: ["operator"],
    status: "approved",
  });
  expect(await cachedData("/api/towns")).toBeNull();
});

it("supports the public Citizens directory for pending users and background page selection", async () => {
  await enable();
  setSyncIdentity({
    uid: "pending-citizens",
    role: "member",
    status: "pending",
  });
  expect(cacheAllowed("/api/citizens")).toBe(true);
  expect(cacheAllowed("/api/citizens/public-user")).toBe(true);
  expect(cacheAllowed("/api/admin/users")).toBe(false);
  expect(cacheAllowed("/api/citizens/user/private")).toBe(false);
  await saveSmartSyncSettings({
    enabled: true,
    pages: ["citizens"],
    interval: 5,
  });
  expect(smartSyncSettings().pages).toEqual(["citizens"]);
  await saveCachedData(
    "/api/citizens",
    [
      {
        uid: "public-user",
        username: "User",
        roles: ["citizen"],
        towns: [],
        joinedAt: null,
      },
    ],
    cacheEpoch(),
  );
  expect((await cachedData<unknown[]>("/api/citizens"))?.data).toHaveLength(1);
  await invalidateCache("/api/citizens/public-user");
  expect(await cachedData("/api/citizens")).toBeNull();
});

it("saves Task Board summaries for approved users, excluding private details and pending users", async () => {
  await saveSmartSyncSettings({
    enabled: true,
    pages: ["task-board"],
    interval: 5,
  });
  expect(smartSyncSettings().pages).toEqual(["task-board"]);
  expect(cacheAllowed("/api/task-board")).toBe(true);
  for (const path of [
    "/api/task-board/listing",
    "/api/task-board/listing/actions",
  ])
    expect(cacheAllowed(path)).toBe(false);
  await saveCachedData(
    "/api/task-board",
    [
      { id: "task", kind: "task" },
      { id: "request", kind: "materials" },
    ],
    cacheEpoch(),
  );
  expect((await cachedData<unknown[]>("/api/task-board"))?.data).toHaveLength(
    2,
  );
  setSyncIdentity({ uid: "pending-board", role: "member", status: "pending" });
  expect(cacheAllowed("/api/task-board")).toBe(false);
  expect(await cachedData("/api/task-board")).toBeNull();
});

it.each(["/api/task-board", "/api/task-board/task/actions"])(
  "invalidates Task Board summaries after a successful write to %s",
  async (path) => {
    await enable();
    await saveCachedData("/api/task-board", [{ id: "task" }], cacheEpoch());
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"id":"task"}', { status: 200 }),
    );
    await apiRequest(path, { method: "POST", body: {} });
    expect(await cachedData("/api/task-board")).toBeNull();
  },
);

it("background sync fetches and saves the selected Task Board list", async () => {
  await saveSmartSyncSettings({
    enabled: true,
    pages: ["task-board"],
    interval: 5,
  });
  vi.mocked(fetch).mockResolvedValue(
    new Response('[{"id":"task","kind":"task"}]', { status: 200 }),
  );
  const { syncSelectedPages } = await import("../src/lib/sync-runner");
  await syncSelectedPages();
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/task-board");
  expect((await cachedData<any[]>("/api/task-board"))?.data[0].id).toBe("task");
});

it("caches public Available listings but never private hiring data or personal listing settings", async () => {
  await saveSmartSyncSettings({
    enabled: true,
    pages: ["task-board"],
    interval: 5,
  });
  expect(cacheAllowed("/api/availability")).toBe(true);
  for (const path of [
    "/api/availability/mine",
    "/api/hiring/inbox",
    "/api/hiring/private",
    "/api/hiring/private?before=10",
  ])
    expect(cacheAllowed(path)).toBe(false);
  await saveCachedData("/api/availability", [{ id: "worker" }], cacheEpoch());
  vi.mocked(fetch).mockResolvedValue(
    new Response('{"id":"worker"}', { status: 200 }),
  );
  await apiRequest("/api/availability/mine", { method: "PUT", body: {} });
  expect(await cachedData("/api/availability")).toBeNull();
});
