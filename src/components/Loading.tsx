import { useSyncExternalStore } from "react";
import { requestCount, subscribeRequests } from "../lib/request-activity";
import "./feedback.css";
export function Spinner() {
  return <span className="loading-spinner" aria-hidden="true" />;
}
export function LoadingStatus({ children }: { children: React.ReactNode }) {
  return (
    <p className="loading-status" role="status">
      <Spinner />
      {children}
    </p>
  );
}
export const usePendingRequests = () =>
  useSyncExternalStore(subscribeRequests, requestCount, () => 0);
export function ServerActivity() {
  const pending = usePendingRequests();
  return pending > 0 ? (
    <div
      className="server-activity"
      role="status"
      aria-label="Waiting for server"
      title="Waiting for server"
    >
      <Spinner />
    </div>
  ) : null;
}
