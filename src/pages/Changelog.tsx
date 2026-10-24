import { useEffect, useState } from "react";
import {
  savedChangelog,
  publishedChangelog,
  type ReleaseEntry,
} from "../lib/changelog";
import ReleaseNotes from "../components/ReleaseNotes";
import "./Changelog.css";
export function VersionList({
  entries,
  onOpen,
}: {
  entries: ReleaseEntry[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="changelog-versions">
      {entries.map((entry) => (
        <button
          key={entry.id}
          className="card changelog-version"
          onClick={() => onOpen(entry.id)}
        >
          <span
            className="changelog-version-icon material-symbol"
            aria-hidden="true"
          >
            {entry.status === "development" ? "construction" : "history"}
          </span>
          <span className="changelog-version-copy">
            <strong>{entry.title}</strong>
            <span>
              {entry.build
                ? `Build ${entry.build}`
                : "Current development notes"}
              {entry.version ? ` · MSI ${entry.version}` : ""}
            </span>
          </span>
          <span className="changelog-version-meta">
            <span className={"changelog-status " + entry.status}>
              {entry.status === "development"
                ? "In development"
                : entry.status === "prerelease"
                  ? "Pre-release"
                  : "Released"}
            </span>
            <time dateTime={entry.date}>
              {new Date(
                entry.date.slice(0, 10) + "T12:00:00",
              ).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </time>
          </span>
          <span className="material-symbol" aria-hidden="true">
            arrow_forward
          </span>
        </button>
      ))}
    </div>
  );
}
export default function Changelog({
  versionId,
  go,
}: {
  versionId?: string;
  go: (page: string) => void;
}) {
  const [entries, setEntries] = useState(savedChangelog),
    [refreshing, setRefreshing] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    setError("");
    void publishedChangelog(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setEntries(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not refresh the version list. Showing saved release history.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const entry = versionId
    ? entries.find((item) => item.id === versionId)
    : null;
  return (
    <div className="changelog-page">
      <header className="page-header page-banner">
        <div>
          <h1>{versionId ? "Release notes" : "Changelog"}</h1>
          <p>
            {versionId
              ? entry?.title || "Find a release in the version list."
              : "Every release, with its own story."}
          </p>
        </div>
        <button onClick={() => go(versionId ? "changelog" : "about")}>
          <span className="material-symbol" aria-hidden="true">
            arrow_back
          </span>
          {versionId ? "All versions" : "About"}
        </button>
      </header>
      {versionId ? (
        entry ? (
          <section className="card changelog-detail">
            <div className="changelog-detail-heading">
              <span className={"changelog-status " + entry.status}>
                {entry.status === "development"
                  ? "In development · Not released"
                  : entry.build
                    ? `Build ${entry.build}${entry.version ? " · MSI " + entry.version : ""}`
                    : "Released"}
              </span>
              {entry.url && (
                <a href={entry.url} target="_blank" rel="noopener noreferrer">
                  View on GitHub
                  <span className="material-symbol" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
              )}
            </div>
            <ReleaseNotes notes={entry.notes} />
          </section>
        ) : refreshing ? (
          <p role="status">Finding release notes…</p>
        ) : (
          <section className="card changelog-detail">
            <h2>Release notes not found</h2>
            <p>Choose a version from the Changelog.</p>
            <button onClick={() => go("changelog")}>All versions</button>
          </section>
        )
      ) : (
        <>
          <div className="changelog-intro">
            <span>Current development and published releases</span>
            <span role="status">
              {refreshing
                ? "Checking GitHub…"
                : error
                  ? "Saved history"
                  : "Up to date"}
            </span>
          </div>
          <VersionList
            entries={entries}
            onOpen={(id) => go("changelog:" + id)}
          />
        </>
      )}
      {error && (
        <div className="changelog-refresh-note">
          <p role="status">{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      )}
    </div>
  );
}
