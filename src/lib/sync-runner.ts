import { apiRequest } from "./api";
import { cacheAllowed, smartSyncSettings } from "./smart-sync";
let status = { running: false, error: "" },
  current: Promise<void> | null = null;
const listeners = new Set<() => void>();
export const syncRunStatus = () => status;
export const subscribeSyncRun = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function update(next: typeof status) {
  status = next;
  listeners.forEach((listener) => listener());
}
export function syncSelectedPages() {
  if (current) return current;
  const settings = smartSyncSettings();
  if (!settings.enabled) return Promise.resolve();
  const paths = settings.pages
    .map((page) => ({
      page,
      path: "/api/" + page,
    }))
    .filter((item) => cacheAllowed(item.path));
  if (!paths.length) return Promise.resolve();
  update({ running: true, error: "" });
  const work = (async () => {
    const results = await Promise.allSettled(
      paths.map((item) => apiRequest(item.path, { networkOnly: true })),
    );
    const failed = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            paths[index].page === "towns"
              ? "Town Registry"
              : paths[index].page === "citizens"
                ? "Citizens"
                : "News",
          ]
        : [],
    );
    update({
      running: false,
      error: failed.length
        ? "Unable to sync " + failed.join(" and ") + "."
        : "",
    });
  })();
  current = work;
  void work
    .finally(() => {
      current = null;
    })
    .catch(() => {});
  return work;
}
