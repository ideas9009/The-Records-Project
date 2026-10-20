import { readFile, stat } from "node:fs/promises";
import { createReadStream, openAsBlob } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
export const repository = "ideas9009/The-Records-Project";
const root = path.resolve(import.meta.dirname, "..");
const manifestName = "update-windows-x86_64.json";
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
export function buildNumber(value) {
  if (
    !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 4294967295
  )
    throw Error("Enter a positive numeric build number, such as 2 or 3.");
  return Number(value);
}
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function prepareRelease({
  build,
  title,
  folder,
  notesFile = "RELEASE-NOTES.md",
}) {
  build = buildNumber(build);
  title = String(title || "").trim();
  if (!title || title.length > 200 || /[\x00-\x1f]/.test(title))
    throw Error("Enter a release title of 1–200 characters.");
  const source = await readFile(
    path.join(root, "src/lib/app-build.ts"),
    "utf8",
  );
  if (Number(source.match(/export const APP_BUILD = (\d+);/)?.[1]) !== build)
    throw Error(
      "This build number does not match APP_BUILD in React. Set APP_BUILD, then build a fresh MSI before publishing.",
    );
  folder = path.resolve(root, folder || `windows-build/build-${build}`);
  const metadataPath = path.join(folder, manifestName),
    signaturePath = metadataPath + ".sig";
  const metadata = await readFile(metadataPath),
    signatureText = (await readFile(signaturePath, "utf8")).trim();
  const publicSource = await readFile(
    path.join(root, "updater/lib/public_key.dart"),
    "utf8",
  );
  const rawKey = Buffer.from(
    publicSource.match(/updatePublicKey = '([^']+)'/)?.[1] || "",
    "base64",
  );
  if (rawKey.length !== 32 || !/^[A-Za-z0-9+/]{86}==$/.test(signatureText))
    throw Error("Invalid release verification material.");
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      rawKey,
    ]),
    format: "der",
    type: "spki",
  });
  if (!verify(null, metadata, key, Buffer.from(signatureText, "base64")))
    throw Error("Release metadata signature verification failed.");
  const m = JSON.parse(metadata);
  if (
    m.schema !== 2 ||
    m.build !== build ||
    m.platform !== "windows-x86_64" ||
    typeof m.filename !== "string" ||
    !/^[A-Za-z0-9 ._-]+_x64_en-US\.msi$/.test(m.filename) ||
    !Number.isSafeInteger(m.size) ||
    m.size <= 0 ||
    !/^[a-f0-9]{64}$/.test(m.sha256)
  )
    throw Error(
      "The signed release metadata does not match this build or platform.",
    );
  if (
    m.url !==
    `https://github.com/${repository}/releases/download/${build}/${encodeURIComponent(m.filename)}`
  )
    throw Error(
      "The signed MSI URL does not match the requested numeric GitHub tag.",
    );
  const msiPath = path.join(folder, m.filename);
  if (
    (await stat(msiPath)).size !== m.size ||
    (await hashFile(msiPath)) !== m.sha256
  )
    throw Error("The MSI does not match its signed size and hash.");
  const assets = [];
  for (const file of [msiPath, metadataPath, signaturePath])
    assets.push({
      path: file,
      name: path.basename(file),
      size: (await stat(file)).size,
      sha256: await hashFile(file),
    });
  const notes = await readFile(path.resolve(root, notesFile), "utf8");
  return { build, title, assets, notes, version: m.version };
}
function githubToken() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
  } catch {}
  try {
    // Read the existing Git login in memory. Never print or write the credential.
    const credential = execFileSync("git", ["credential", "fill"], {
      cwd: root,
      input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: 30000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });
    const token = credential.match(/^password=(.+)$/m)?.[1]?.trim();
    if (token) return token;
  } catch {}
  throw Error(
    "Sign in to GitHub using Git Credential Manager or 'gh auth login', then run this file again. A token with repository Contents write access is required.",
  );
}
function githubClient(token) {
  return async function request(
    method,
    route,
    body,
    { upload = false, allowMissing = false } = {},
  ) {
    const url = new URL(
      route.startsWith("https:") ? route : `https://api.github.com${route}`,
    );
    if (
      !["api.github.com", "uploads.github.com"].includes(url.hostname) ||
      url.protocol !== "https:"
    )
      throw Error("Unexpected GitHub API host.");
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "TheRecordsProject-ReleasePublisher",
        ...(body
          ? {
              "Content-Type": upload
                ? "application/octet-stream"
                : "application/json",
            }
          : {}),
      },
      ...(body ? { body: upload ? body : JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180000),
    });
    if (allowMissing && response.status === 404) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(
        `GitHub ${method} failed (${response.status}): ${data.message || "Request failed"}`,
      );
    return data;
  };
}
export async function publishRelease(
  plan,
  {
    request,
    commit,
    log = console.log,
    uploadFile = (file) => openAsBlob(file.path),
  },
) {
  const base = `/repos/${repository}`;
  const latest = await request("GET", base + "/releases/latest", undefined, {
    allowMissing: true,
  });
  if (
    latest &&
    /^[1-9]\d*$/.test(latest.tag_name) &&
    Number(latest.tag_name) >= plan.build
  )
    throw Error(
      "This build or a newer build is already published. Published releases are never overwritten.",
    );
  let release = await request(
    "GET",
    base + "/releases/tags/" + plan.build,
    undefined,
    { allowMissing: true },
  );
  // GitHub's by-tag endpoint does not return unpublished drafts.
  if (!release) {
    for (let page = 1; ; page++) {
      const releases = await request(
        "GET",
        base + `/releases?per_page=100&page=${page}`,
      );
      release = releases.find((item) => item.tag_name === String(plan.build));
      if (release || releases.length < 100) break;
    }
  }
  if (release && !release.draft)
    throw Error("This tag is already published. Use a new build number.");
  // A numeric tag left from an interrupted draft must still point at this commit.
  const tag = await request(
    "GET",
    base + "/git/ref/tags/" + plan.build,
    undefined,
    { allowMissing: true },
  );
  if (tag && (tag.object?.type !== "commit" || tag.object?.sha !== commit))
    throw Error(
      "This tag already points at a different commit. Use a new build number.",
    );
  if (release && release.target_commitish !== commit)
    throw Error(
      "The existing draft belongs to another commit. It was left unchanged.",
    );
  if (!release)
    release = await request("POST", base + "/releases", {
      tag_name: String(plan.build),
      target_commitish: commit,
      name: plan.title,
      body: plan.notes,
      draft: true,
      prerelease: false,
    });
  log(`Uploading into draft: ${release.html_url}`);
  try {
    const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ""));
    if (
      uploadUrl.origin !== "https://uploads.github.com" ||
      uploadUrl.pathname !== base + `/releases/${release.id}/assets`
    )
      throw Error("Unexpected release upload destination.");
    const existing = await request(
      "GET",
      base + `/releases/${release.id}/assets?per_page=100`,
    );
    for (const asset of plan.assets) {
      let remote = existing.find((item) => item.name === asset.name);
      if (!remote) {
        log(
          `Uploading ${asset.name} (${(asset.size / 1048576).toFixed(2)} MB)…`,
        );
        const url = new URL(uploadUrl);
        url.searchParams.set("name", asset.name);
        remote = await request("POST", url.href, await uploadFile(asset), {
          upload: true,
        });
      }
      if (
        remote.state !== "uploaded" ||
        remote.size !== asset.size ||
        remote.digest !== "sha256:" + asset.sha256
      )
        throw Error(
          `GitHub's uploaded hash or size does not match ${asset.name}. The release remains a draft.`,
        );
    }
    const verified = await request(
      "GET",
      base + `/releases/${release.id}/assets?per_page=100`,
    );
    if (
      verified.length !== plan.assets.length ||
      plan.assets.some(
        (asset) =>
          !verified.some(
            (remote) =>
              remote.name === asset.name &&
              remote.state === "uploaded" &&
              remote.size === asset.size &&
              remote.digest === "sha256:" + asset.sha256,
          ),
      )
    )
      throw Error(
        "The draft does not contain exactly the three verified release files.",
      );
    const published = await request("PATCH", base + `/releases/${release.id}`, {
      name: plan.title,
      body: plan.notes,
      draft: false,
      prerelease: false,
      make_latest: "true",
    });
    const current = await request("GET", base + "/releases/latest");
    if (
      published.draft ||
      current.id !== published.id ||
      current.tag_name !== String(plan.build)
    )
      throw Error(
        "The release was published, but latest-release verification failed. Inspect GitHub before retrying.",
      );
    log(`Published build ${plan.build}: ${published.html_url}`);
    return published;
  } catch (error) {
    log(`Inspect this release before retrying: ${release.html_url}`);
    throw error;
  }
}
async function main() {
  const args = process.argv.slice(2),
    flags = {};
  for (let i = 0; i < args.length; i++) {
    if (["--yes", "--dry-run"].includes(args[i]))
      flags[args[i].slice(2)] = true;
    else if (
      ["--build", "--title", "--folder", "--notes"].includes(args[i]) &&
      args[i + 1]
    )
      flags[args[i].slice(2)] = args[++i];
    else
      throw Error(
        "Usage: Publish-Release.bat [--build 2 --title Nostra-2-Phase-1 --folder windows-build/build-2] [--dry-run] [--yes]",
      );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let plan;
  try {
    const build =
      flags.build || (await rl.question("Build number (numeric GitHub tag): "));
    const title =
      flags.title ||
      (await rl.question("Release title (for example Nostra-2-Phase-1): "));
    plan = await prepareRelease({
      build,
      title,
      folder: flags.folder,
      notesFile: flags.notes,
    });
    console.log(
      `Repository: ${repository}\nBuild/tag: ${plan.build}\nTitle: ${plan.title}\nMSI version: ${plan.version}\nVerified: ${plan.assets.map((asset) => asset.name).join(", ")}`,
    );
    if (flags["dry-run"]) {
      console.log("Dry run passed. No GitHub changes were made.");
      return;
    }
    if (
      !flags.yes &&
      (await rl.question("Publish this release now? [y/N] "))
        .trim()
        .toLowerCase() !== "y"
    ) {
      console.log("Cancelled. No GitHub changes were made.");
      return;
    }
  } finally {
    rl.close();
  }
  if (
    git("remote", "get-url", "origin").replace(/\.git$/, "") !==
    `https://github.com/${repository}`
  )
    throw Error("The origin repository does not match the publisher.");
  if (git("diff", "--name-only", "HEAD"))
    throw Error("Commit tracked source changes before publishing.");
  if (
    git(
      "ls-files",
      "--others",
      "--exclude-standard",
      "src",
      "server",
      "updater",
      "src-tauri",
      "scripts",
    )
  )
    throw Error(
      "Commit new source files before publishing so the release tag includes the app's source.",
    );
  const commit = git("rev-parse", "HEAD");
  const request = githubClient(githubToken());
  const repo = await request("GET", `/repos/${repository}`);
  const branch = await request(
    "GET",
    `/repos/${repository}/git/ref/heads/${repo.default_branch}`,
  );
  if (branch.object.sha !== commit)
    throw Error(
      "Push this commit to the repository's default branch before publishing.",
    );
  await publishRelease(plan, { request, commit });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error("Release not completed:", error.message);
    process.exitCode = 1;
  });
