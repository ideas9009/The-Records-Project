export const desktopRefreshEvent = "records-desktop-refresh";
const resyncKey = "records-resync-after-reload";
export function guardPageAction(
  proceed: () => void,
  anchor: HTMLElement | null = null,
) {
  if (
    window.dispatchEvent(
      new CustomEvent("records-navigate", {
        cancelable: true,
        detail: { proceed, anchor },
      }),
    )
  )
    proceed();
}
export function reloadDesktopApp() {
  sessionStorage.setItem(resyncKey, "true");
  window.location.reload();
}
export function consumeDesktopResync() {
  if (sessionStorage.getItem(resyncKey) !== "true") return false;
  sessionStorage.removeItem(resyncKey);
  return true;
}
