/** Background requests run at most once per interval, only while visible/online.
 * User actions can still call their load function directly for an immediate refresh. */
export const BACKGROUND_SYNC_MS = 10 * 60 * 1000;
export function startBackgroundPolling(load: () => unknown, interval = BACKGROUND_SYNC_MS) {
  let stopped = false, busy = false, lastAttempt: number | null = null;
  const refresh = () => {
    if (stopped || busy || (typeof document !== "undefined" && document.visibilityState === "hidden") || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    if (lastAttempt !== null && Date.now() - lastAttempt < interval) return;
    lastAttempt = Date.now();
    busy = true;
    void (async()=>{try{await load()}catch{}finally{busy=false}})();
  };
  refresh();
  const timer = setInterval(refresh, interval);
  window.addEventListener("focus", refresh);
  window.addEventListener("online", refresh);
  if(typeof document !== "undefined")document.addEventListener("visibilitychange", refresh);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("online", refresh);
    if(typeof document !== "undefined")document.removeEventListener("visibilitychange", refresh);
  };
}