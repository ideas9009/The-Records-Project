import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus } from "./Loading";
type Notification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};
export default function Notifications() {
  const [rows, setRows] = useState<Notification[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("records-refresh-notifications", refresh);
    return () =>
      window.removeEventListener("records-refresh-notifications", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<Notification[]>("/api/notifications", { networkOnly: true })
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Notifications could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <div className="notifications-inbox">
      <button
        className="notifications-refresh"
        disabled={loading}
        onClick={() => setRevision((n) => n + 1)}
        data-page-refresh
      >
        Refresh
      </button>
      {loading && <LoadingStatus>Loading notifications…</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && <p>No notifications yet.</p>}
      {rows.map((row) => (
        <article className="notification-item" key={row.id}>
          <h3>{row.title}</h3>
          <p>{row.message}</p>
          <time dateTime={row.createdAt}>
            {new Date(row.createdAt).toLocaleString()}
          </time>
        </article>
      ))}
    </div>
  );
}
