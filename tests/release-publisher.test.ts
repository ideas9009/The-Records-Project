import { APP_BUILD } from "../src/lib/app-build";
import { describe, it, expect } from "vitest";
// The publisher is a Node-only script, independent of the application UI.
// @ts-ignore JavaScript publishing utility
import {
  buildNumber,
  prepareRelease,
  publishRelease,
  repository,
} from "../scripts/publish-release.mjs";
const commit = "a".repeat(40);
const assets = ["app.msi", "update.json", "update.json.sig"].map((name, i) => ({
  name,
  size: i + 1,
  sha256: String(i).repeat(64),
}));
const plan = {
  build: 2,
  title: "Nostra-2-Phase-1",
  assets,
  notes: "Release notes",
};
function fixture(
  options: {
    corrupt?: boolean;
    published?: boolean;
    failUpload?: boolean;
    tagCommit?: string;
    draft?: boolean;
  } = {},
) {
  const calls: { method: string; route: string; body: any }[] = [],
    uploaded: any[] = [];
  const release = {
    id: 12,
    draft: true,
    tag_name: "2",
    target_commitish: commit,
    html_url: "https://github.com/" + repository + "/releases/tag/2",
    upload_url:
      "https://uploads.github.com/repos/" +
      repository +
      "/releases/12/assets{?name,label}",
  };
  let published = false;
  async function request(method: string, route: string, body: any) {
    calls.push({ method, route, body });
    if (route.endsWith("/releases/latest"))
      return published
        ? { ...release, draft: false }
        : options.published
          ? { ...release, draft: false }
          : { id: 1, tag_name: "v2.0.0" };
    if (route.endsWith("/releases/tags/2")) return null;
    if (route.includes("/releases?per_page=100"))
      return options.draft ? [release] : [];
    if (route.endsWith("/git/ref/tags/2"))
      return options.tagCommit
        ? { object: { type: "commit", sha: options.tagCommit } }
        : null;
    if (method === "POST" && route.endsWith("/releases")) return release;
    if (method === "GET" && route.includes("/assets?")) return uploaded;
    if (method === "POST" && route.startsWith("https://uploads.github.com/")) {
      if (options.failUpload) throw Error("Upload interrupted");
      const name = new URL(route).searchParams.get("name"),
        asset = assets.find((a) => a.name === name)!;
      const remote = {
        id: uploaded.length + 1,
        name,
        size: asset.size,
        state: "uploaded",
        digest: "sha256:" + (options.corrupt ? "f".repeat(64) : asset.sha256),
      };
      uploaded.push(remote);
      return remote;
    }
    if (method === "PATCH") {
      published = true;
      return { ...release, draft: false };
    }
    throw Error("Unexpected test route " + route);
  }
  return { calls, request };
}
describe("GitHub release publisher", () => {
  it("accepts numeric build tags and rejects versions or labels", () => {
    expect(buildNumber("2")).toBe(2);
    for (const value of ["0", "02", "v2.0.0", "Nostra-2", "-1", "4294967296"])
      expect(() => buildNumber(value)).toThrow();
  });
  it("rejects relabeling the current MSI as another React build", async () => {
    await expect(
      prepareRelease({ build: APP_BUILD + 1, title: "Wrong build" }),
    ).rejects.toThrow("does not match APP_BUILD");
  });
  it("uploads and verifies every asset before publishing the draft as latest", async () => {
    const f = fixture();
    const result = await publishRelease(plan, {
      request: f.request,
      commit,
      log: () => {},
      uploadFile: async () => "bytes",
    });
    expect(result.draft).toBe(false);
    const create = f.calls.find(
      (c) => c.method === "POST" && c.route.endsWith("/releases"),
    )!;
    expect(create.body).toMatchObject({
      draft: true,
      tag_name: "2",
      name: plan.title,
      target_commitish: commit,
    });
    const published = f.calls.findIndex((c) => c.method === "PATCH");
    expect(
      f.calls
        .slice(0, published)
        .filter((c) => c.route.startsWith("https://uploads.github.com/")),
    ).toHaveLength(3);
    expect(f.calls[published].body).toMatchObject({
      draft: false,
      make_latest: "true",
    });
  });
  it("leaves the release unpublished after a corrupt upload", async () => {
    const f = fixture({ corrupt: true });
    await expect(
      publishRelease(plan, {
        request: f.request,
        commit,
        log: () => {},
        uploadFile: async () => "bytes",
      }),
    ).rejects.toThrow("hash or size");
    expect(f.calls.some((c) => c.method === "PATCH")).toBe(false);
  });
  it("leaves the release unpublished after an interrupted upload", async () => {
    const f = fixture({ failUpload: true });
    await expect(
      publishRelease(plan, {
        request: f.request,
        commit,
        log: () => {},
        uploadFile: async () => "bytes",
      }),
    ).rejects.toThrow("interrupted");
    expect(f.calls.some((c) => c.method === "PATCH")).toBe(false);
  });
  it("never overwrites an already published build", async () => {
    const f = fixture({ published: true });
    await expect(
      publishRelease(plan, { request: f.request, commit, log: () => {} }),
    ).rejects.toThrow("already published");
    expect(f.calls.some((c) => c.method !== "GET")).toBe(false);
  });
  it("refuses a tag pointing to another commit", async () => {
    const f = fixture({ tagCommit: "b".repeat(40) });
    await expect(
      publishRelease(plan, { request: f.request, commit, log: () => {} }),
    ).rejects.toThrow("different commit");
    expect(f.calls.some((c) => c.method !== "GET")).toBe(false);
  });
});

it("resumes a matching unpublished draft instead of trying to create it again", async () => {
  const f = fixture({ draft: true });
  await publishRelease(plan, {
    request: f.request,
    commit,
    log: () => {},
    uploadFile: async () => "bytes",
  });
  expect(
    f.calls.some((c) => c.method === "POST" && c.route.endsWith("/releases")),
  ).toBe(false);
  expect(f.calls.some((c) => c.method === "PATCH")).toBe(true);
});
