export type SmartSyncSettings = {
  enabled: boolean;
  pages: ("towns" | "news" | "citizens" | "task-board")[];
  interval: number;
};
export type SyncState = {
  source: "saved" | "live";
  savedAt: number;
  syncing: boolean;
  error?: string;
};
type Identity = {
  uid: string;
  role: string;
  roles?: readonly string[];
  status: string;
};
type Entry = {
  key: string;
  scope: string;
  path: string;
  data: unknown;
  savedAt: number;
  bytes: number;
};
const settingsKey = "records-smartsync",
  maximumBytes = 50 * 1024 * 1024,
  maximumAge = 24 * 60 * 60 * 1000;
const defaults: SmartSyncSettings = {
  enabled: false,
  pages: ["towns", "news"],
  interval: 5,
};
let identity: Identity | null = null,
  origin = "",
  epoch = 0,
  revision = 0,
  database: Promise<IDBDatabase> | null = null;
const listeners = new Set<() => void>(),
  states = new Map<string, SyncState>();
export const subscribeSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const syncRevision = () => revision;
const notify = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
export function smartSyncSettings(): SmartSyncSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(settingsKey) || "null");
    return raw
      ? {
          enabled: raw.enabled === true,
          pages: Array.isArray(raw.pages)
            ? raw.pages.filter((p: string) =>
                ["towns", "news", "citizens", "task-board"].includes(p),
              )
            : defaults.pages,
          interval: [1, 5, 15, 30].includes(raw.interval) ? raw.interval : 5,
        }
      : { ...defaults, pages: [...defaults.pages] };
  } catch {
    return { ...defaults, pages: [...defaults.pages] };
  }
}
export const syncState = (path: string) => states.get(path);
export function markSync(path: string, state: SyncState) {
  states.set(path, state);
  notify();
}
export function setSyncIdentity(account: Identity | null, server = "") {
  const old = cacheScope();
  const next = account
    ? server +
      ":" +
      account.uid +
      ":" +
      (account.roles?.slice().sort().join(",") || account.role) +
      ":" +
      account.status
    : "";
  if (old === next) return;
  identity = account;
  origin = server;
  epoch++;
  states.clear();
  notify();
  if (old) void clearScope(old, epoch).catch(() => {});
}
export const cacheScope = () =>
  identity
    ? origin +
      ":" +
      identity.uid +
      ":" +
      (identity.roles?.slice().sort().join(",") || identity.role) +
      ":" +
      identity.status
    : "";
export const cacheEpoch = () => epoch;
export function cacheAllowed(path: string) {
  if (!identity || !smartSyncSettings().enabled) return false;
  if (path === "/api/towns/mayor-options") return false;
  if (path === "/api/towns" || path === "/api/towns/stats") return true;
  if (
    (identity.status === "approved" || identity.status === "pending") &&
    (path === "/api/citizens" || /^\/api\/citizens\/[A-Za-z0-9_-]+$/.test(path))
  )
    return true;
  if (identity.status !== "approved") return false;
  return (
    path === "/api/availability" ||
    path === "/api/task-board" ||
    path === "/api/news" ||
    /^\/api\/towns\/[A-Za-z0-9_-]+(?:\/photos)?$/.test(path) ||
    (/^\/api\/news\/[A-Za-z0-9_-]+$/.test(path) && path !== "/api/news/manage")
  );
}
function db() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("records-smartsync-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("entries", { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = null;
        reject(Error("Offline storage is unavailable."));
      };
    });
  return database;
}
async function entries(): Promise<Entry[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("entries", "readonly")
      .objectStore("entries")
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function mutate(remove: string[], entry?: Entry, expectedEpoch?: number) {
  const database = await db();
  if (expectedEpoch !== undefined && expectedEpoch !== epoch) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("entries", "readwrite"),
      store = transaction.objectStore("entries");
    remove.forEach((key) => store.delete(key));
    if (entry) store.put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  notify();
}
async function clearScope(scope: string, generation: number) {
  const all = await entries();
  await mutate(
    all.filter((item) => item.scope === scope).map((item) => item.key),
    undefined,
    generation,
  );
}
export async function clearSavedData() {
  epoch++;
  states.clear();
  const all = await entries();
  await mutate(all.map((item) => item.key));
}
export async function saveSmartSyncSettings(settings: SmartSyncSettings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  notify();
  if (!settings.enabled) await clearSavedData();
}
export async function cachedData<T>(
  path: string,
): Promise<{ data: T; savedAt: number } | null> {
  if (!cacheAllowed(path)) return null;
  const scope = cacheScope(),
    generation = epoch;
  const all = await entries(),
    entry = all.find((item) => item.key === scope + ":" + path);
  if (generation !== epoch || !entry) return null;
  if (Date.now() - entry.savedAt > maximumAge) {
    await mutate([entry.key]);
    return null;
  }
  return { data: entry.data as T, savedAt: entry.savedAt };
}
let writeQueue = Promise.resolve();
export function saveCachedData(
  path: string,
  data: unknown,
  generation: number,
) {
  const operation = async () => {
    if (generation !== epoch || !cacheAllowed(path)) return;
    if (
      path.startsWith("/api/news/") &&
      (!data ||
        typeof data !== "object" ||
        (data as { status?: string }).status !== "published")
    ) {
      await mutate([cacheScope() + ":" + path], undefined, generation);
      return;
    }
    if (
      path === "/api/news" &&
      (!Array.isArray(data) || data.some((item) => item.status !== "published"))
    ) {
      await mutate([cacheScope() + ":" + path], undefined, generation);
      return;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
    if (bytes > maximumBytes)
      throw Error("This response is too large to save offline.");
    const scope = cacheScope(),
      all = (await entries())
        .filter((item) => item.key !== scope + ":" + path)
        .sort((a, b) => a.savedAt - b.savedAt),
      remove: string[] = [];
    let size = all.reduce((sum, item) => sum + item.bytes, 0) + bytes;
    while (all.length && (size > maximumBytes || all.length >= 100)) {
      const oldest = all.shift()!;
      size -= oldest.bytes;
      remove.push(oldest.key);
    }
    await mutate(
      remove,
      {
        key: scope + ":" + path,
        scope,
        path,
        data,
        savedAt: Date.now(),
        bytes,
      },
      generation,
    );
  };
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => {});
  return result;
}
export async function invalidateCache(path: string) {
  const scope = cacheScope();
  if (!scope) return;
  epoch++;
  const group = path.startsWith("/api/availability")
    ? "/api/availability"
    : path.startsWith("/api/task-board")
      ? "/api/task-board"
      : path.startsWith("/api/news")
        ? "/api/news"
        : path.startsWith("/api/citizens")
          ? "/api/citizens"
          : path.startsWith("/api/towns")
            ? "/api/towns"
            : path;
  for (const key of states.keys())
    if (key.startsWith(group)) states.delete(key);
  const all = await entries();
  await mutate(
    all
      .filter((item) => item.scope === scope && item.path.startsWith(group))
      .map((item) => item.key),
  );
}
export async function savedDataStats() {
  const all = await entries(),
    scope = cacheScope();
  const current = all.filter(
    (item) => item.scope === scope && Date.now() - item.savedAt <= maximumAge,
  );
  return {
    count: current.length,
    bytes: all.reduce((sum, item) => sum + item.bytes, 0),
    lastSynced: current.length
      ? Math.max(...current.map((item) => item.savedAt))
      : null,
  };
}
export const canRetainOfflineSession = (lastVerified: number) =>
  smartSyncSettings().enabled && Date.now() - lastVerified < 15 * 60 * 1000;
