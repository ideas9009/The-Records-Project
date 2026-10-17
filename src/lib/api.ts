import { beginRequest } from "./request-activity";
import {
  cacheEpoch,
  cacheAllowed,
  cachedData,
  saveCachedData,
  setSyncIdentity,
  markSync,
  syncState,
  invalidateCache,
} from "./smart-sync";
const tokenKey = "records-server-session";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function apiBase() {
  const configured = (import.meta.env.VITE_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (configured) {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" &&
      !(
        import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw Error("The sign-in service requires a secure connection.");
    return configured;
  }
  return "";
}
export const session = () => sessionStorage.getItem(tokenKey);
export function setSession(token: string | null) {
  setSyncIdentity(null);
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
  window.dispatchEvent(new Event("records-session"));
}
type Options = { method?: string; body?: unknown; networkOnly?: boolean };
const inFlight = new Map<string, Promise<unknown>>();
export function apiRequest<T = any>(
  path: string,
  options: Options = {},
): Promise<T> {
  const method = options.method || "GET",
    key = session() + ":" + path + ":" + !!options.networkOnly;
  if (method !== "GET") return request<T>(path, options);
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = request<T>(path, options);
  inFlight.set(key, pending);
  void pending
    .finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    })
    .catch(() => {});
  return pending;
}
async function request<T>(path: string, options: Options): Promise<T> {
  const base = apiBase();
  if (!base && !import.meta.env.DEV)
    throw Error("The sign-in service has not been configured.");
  const finish = beginRequest(),
    token = session(),
    generation = cacheEpoch(),
    get = (options.method || "GET") === "GET";
  if (get && cacheAllowed(path)) {
    const old = syncState(path);
    if (old) markSync(path, { ...old, syncing: true, error: "" });
  }
  try {
    let response: Response;
    try {
      response = await fetch(base + path, {
        method: options.method || "GET",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(65000),
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
      });
    } catch {
      throw Error("The server could not be reached. Please try again.");
    }
    if (
      response.status === 401 &&
      token &&
      token === session() &&
      !path.startsWith("/api/auth/login")
    )
      setSession(null);
    if ([403, 404].includes(response.status) && cacheAllowed(path))
      await invalidateCache(path).catch(() => {});
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "The server returned an invalid response.",
        response.ok ? 502 : response.status,
      );
    }
    if (!response.ok) {
      throw new ApiError(
        data.error || "The request could not be completed.",
        response.status,
      );
    }
    if (token !== session())
      throw new ApiError("Your session has changed. Please try again.", 401);
    if (path === "/api/auth/me" && data.account)
      setSyncIdentity(data.account, base);
    if (
      !get &&
      (path.startsWith("/api/news") ||
        path.startsWith("/api/towns") ||
        path.startsWith("/api/admin/test-town"))
    )
      await invalidateCache(
        path.startsWith("/api/admin") ? "/api/towns" : path,
      ).catch(() => {});
    if (get && cacheAllowed(path)) {
      try {
        await saveCachedData(path, data, generation);
        markSync(path, { source: "live", savedAt: Date.now(), syncing: false });
      } catch {
        markSync(path, {
          source: "live",
          savedAt: Date.now(),
          syncing: false,
          error: "Data loaded, but could not be saved offline.",
        });
      }
    }
    return data;
  } catch (reason) {
    const retriable = !(reason instanceof ApiError) || reason.status >= 500;
    if (
      get &&
      retriable &&
      token === session() &&
      generation === cacheEpoch()
    ) {
      const cached = await cachedData<T>(path).catch(() => null);
      if (cached) {
        markSync(path, {
          source: "saved",
          savedAt: cached.savedAt,
          syncing: false,
          error: "Unable to sync. Showing saved data.",
        });
        if (!options.networkOnly) return cached.data;
      }
    }
    const old = syncState(path);
    if (old)
      markSync(path, {
        ...old,
        syncing: false,
        error: reason instanceof Error ? reason.message : "Unable to sync.",
      });
    throw reason;
  } finally {
    finish();
  }
}
export function watchResource<T>(
  path: string,
  next: (value: T) => void,
  error: (reason: Error) => void,
) {
  let active = true,
    busy = false;
  const refresh = async () => {
    if (busy) return;
    busy = true;
    try {
      const value = await apiRequest<T>(path);
      if (active) next(value);
    } catch (reason) {
      if (active)
        error(reason instanceof Error ? reason : Error("The request failed."));
    } finally {
      busy = false;
    }
  };
  void cachedData<T>(path)
    .then((cached) => {
      if (active && cached) {
        markSync(path, {
          source: "saved",
          savedAt: cached.savedAt,
          syncing: true,
        });
        next(cached.data);
      }
    })
    .catch(() => {})
    .finally(() => {
      if (active) void refresh();
    });
  const timer = window.setInterval(() => void refresh(), 30000),
    focus = () => void refresh();
  window.addEventListener("focus", focus);
  window.addEventListener("online", focus);
  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener("focus", focus);
    window.removeEventListener("online", focus);
  };
}
