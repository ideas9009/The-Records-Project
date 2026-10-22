import currentNotes from "../../RELEASE-NOTES.md?raw";
import build2Notes from "../../release-notes/archive/nostra-2-phase-1-build-2.md?raw";
import build3Notes from "../../release-notes/archive/nostra-2-phase-1-build-3.md?raw";
import { APP_RELEASE_LABEL } from "./app-release";
const repository = "ideas9009/The-Records-Project";
export type ReleaseEntry = {
  id: string;
  title: string;
  build?: number;
  version?: string;
  date: string;
  status: "development" | "released" | "prerelease";
  notes: string;
  url?: string;
};
export const savedChangelog: ReleaseEntry[] = [
  {
    id: "phase-2",
    title: APP_RELEASE_LABEL,
    date: "2026-10-22",
    status: "development",
    notes: currentNotes,
  },
  {
    id: "3",
    title: "Nostra · 2 | Phase 1",
    build: 3,
    version: "1.4.1",
    date: "2026-10-20",
    status: "released",
    notes: build3Notes,
    url: `https://github.com/${repository}/releases/tag/3`,
  },
  {
    id: "2",
    title: "Nostra · 2 | Phase 1",
    build: 2,
    version: "1.4.0",
    date: "2026-10-20",
    status: "released",
    notes: build2Notes,
    url: `https://github.com/${repository}/releases/tag/2`,
  },
];
export function mergePublishedReleases(
  records: unknown[],
  saved = savedChangelog,
): ReleaseEntry[] {
  const entries = new Map(saved.map((entry) => [entry.id, entry]));
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const r = record as Record<string, unknown>;
    if (
      r.draft !== false ||
      typeof r.tag_name !== "string" ||
      !r.tag_name ||
      r.tag_name === "phase-2" ||
      typeof r.published_at !== "string" ||
      !Number.isFinite(Date.parse(r.published_at))
    )
      continue;
    const previous = entries.get(r.tag_name),
      build = /^[1-9]\d*$/.test(r.tag_name) ? Number(r.tag_name) : undefined;
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const msi = assets.find(
      (asset) =>
        typeof asset?.name === "string" && /_x64_en-US\.msi$/.test(asset.name),
    );
    entries.set(r.tag_name, {
      id: r.tag_name,
      title:
        previous?.title ||
        (typeof r.name === "string" && r.name ? r.name : r.tag_name),
      build,
      version:
        previous?.version ||
        msi?.name.match(/_(\d+\.\d+\.\d+)_x64_en-US\.msi$/)?.[1],
      date: r.published_at,
      status: r.prerelease === true ? "prerelease" : "released",
      // Published snapshots stay immutable in the app; live notes fill new versions.
      notes:
        previous?.notes ||
        (typeof r.body === "string" && r.body.trim()
          ? r.body
          : "No release notes were provided for this version."),
      url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(r.tag_name)}`,
    });
  }
  return [...entries.values()].sort((a, b) =>
    a.status === "development"
      ? b.status === "development"
        ? 0
        : -1
      : b.status === "development"
        ? 1
        : Date.parse(b.date) - Date.parse(a.date) ||
          (b.build || 0) - (a.build || 0),
  );
}
let cached: { at: number; records: unknown[] } | null = null;
export async function publishedChangelog(signal: AbortSignal) {
  if (cached && Date.now() - cached.at < 5 * 60 * 1000)
    return mergePublishedReleases(cached.records);
  const records: unknown[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      },
    );
    if (!response.ok)
      throw Error(
        "Could not refresh the version list. Showing saved release history.",
      );
    const items: unknown = await response.json();
    if (!Array.isArray(items))
      throw Error(
        "GitHub returned an invalid version list. Showing saved release history.",
      );
    records.push(...items);
    if (items.length < 100) break;
  }
  cached = { at: Date.now(), records };
  return mergePublishedReleases(records);
}
