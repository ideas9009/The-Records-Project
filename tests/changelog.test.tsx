import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  savedChangelog,
  mergePublishedReleases,
  publishedChangelog,
} from "../src/lib/changelog";
import { VersionList } from "../src/pages/Changelog";
import ReleaseNotes from "../src/components/ReleaseNotes";
import { canAccessPage, type Account } from "../src/lib/access";
afterEach(() => vi.unstubAllGlobals());
it("keeps released Phase 2 notes separate from the two original Phase 1 releases", () => {
  const [current, build3, build2] = savedChangelog;
  expect(current.status).toBe("released");
  expect(current).toMatchObject({id:"4",build:4,version:"1.4.2"});
  expect(current.notes).toContain("# Nostra · 2 | Phase 2");
  expect(current.notes).not.toContain("## Player directory PDF export");
  expect(build3.notes).toContain("Phase 1, Build 3 (Windows MSI 1.4.1)");
  expect(build2.notes).toContain("Phase 1, Build 2 (Windows MSI 1.4.0)");
  expect(build2.notes).not.toContain("Build 3 advances");
  expect(build2.notes).not.toContain("\r\r\n");
  expect(build3.notes).not.toContain("\r\r\n");
});
it("adds newly published versions, sorts newest first, and never imports drafts", () => {
  const entries = mergePublishedReleases([
    {
      tag_name: "5",
      name: "Nostra-2-Phase-2",
      draft: false,
      prerelease: false,
      published_at: "2026-10-25T10:00:00Z",
      body: "# New version",
      assets: [{ name: "TRP_1.4.3_x64_en-US.msi" }],
    },
    {
      tag_name: "5",
      name: "Private draft",
      draft: true,
      published_at: "2026-10-24T10:00:00Z",
      body: "Private notes",
    },
    {
      tag_name: "3",
      name: "Changed title",
      draft: false,
      published_at: "2026-10-20T16:18:36Z",
      body: "Changed historical notes",
    },
    null,
    {},
  ]);
  expect(entries.map((e) => e.id)).toEqual(["5", "4", "3", "2"]);
  expect(entries[0]).toMatchObject({build:5, version:"1.4.3", notes:"# New version"});
  expect(entries[2].notes).toBe(savedChangelog[1].notes);
});
it("renders distinct version buttons and safe individual Markdown notes", () => {
  const html = renderToStaticMarkup(
    <VersionList entries={savedChangelog} onOpen={() => {}} />,
  );
  expect(html).toContain("Build 3");
  expect(html).toContain("Build 2");
  expect(html).toContain("Build 4");
  expect(html).not.toContain("In development");
  const notes = renderToStaticMarkup(
    <ReleaseNotes
      notes={
        "# Notes\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))"
      }
    />,
  );
  expect(notes).not.toContain("<script>");
  expect(notes).not.toContain('href="javascript:');
});
it("failed live refresh does not discard the bundled offline archive", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 503 })),
  );
  await expect(
    publishedChangelog(new AbortController().signal),
  ).rejects.toThrow("saved release history");
  expect(savedChangelog.map((e) => e.id)).toEqual(["4", "3", "2"]);
});
it("history is readable by approved and pending members without granting administrative access", () => {
  const account: Account = {
    username: "Player",
    role: "member",
    status: "pending",
    createdAt: "",
  };
  for (const page of ["changelog", "changelog:2", "changelog:phase-2"])
    expect(canAccessPage(account, page)).toBe(true);
  expect(canAccessPage(account, "admin")).toBe(false);
  expect(canAccessPage({ ...account, status: "suspended" }, "changelog")).toBe(
    false,
  );
  expect(canAccessPage(null, "changelog")).toBe(false);
});
