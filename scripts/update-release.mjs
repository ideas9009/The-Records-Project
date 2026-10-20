import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  createHash,
} from "node:crypto";
import { readFile, writeFile, mkdir, stat, access } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  keyDir =
    process.env.TRP_UPDATE_KEY_DIR ||
    path.join(
      process.env.LOCALAPPDATA || process.env.HOME,
      "TheRecordsProjectReleaseKeys",
    ),
  keyPath = path.join(keyDir, "update-private.pem");
if (process.argv[2] === "--init") {
  await mkdir(keyDir, { recursive: true });
  try {
    await access(keyPath);
  } catch {
    try {
      await access(path.join(root, "updater/lib/public_key.dart"));
      throw Error(
        "The existing verification key must not be replaced. Restore its matching private key from backup.",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const { privateKey } = generateKeyPairSync("ed25519");
    await writeFile(
      keyPath,
      privateKey.export({ type: "pkcs8", format: "pem" }),
      { flag: "wx", mode: 0o600 },
    );
  }
  const pub = createPublicKey(createPrivateKey(await readFile(keyPath))).export(
    { format: "jwk" },
  ).x;
  await writeFile(
    path.join(root, "updater/lib/public_key.dart"),
    `// Public verification key. Keep the private key outside the repository.\nconst updatePublicKey = '${Buffer.from(pub, "base64url").toString("base64")}';\n`,
  );
  console.log(
    "Update signing key ready. Private key stays in the local release-key directory; back it up securely.",
  );
} else {
  const file = path.resolve(process.argv[2] || ""),
    version = JSON.parse(
      await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
    ).version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || !file.toLowerCase().endsWith(".msi"))
    throw Error("Pass the release MSI; use a stable numeric version.");
  const buildSource = await readFile(path.join(root, "src/lib/app-build.ts"), "utf8");
  const build = Number(buildSource.match(/export const APP_BUILD = (\d+);/)?.[1]);
  if (!Number.isSafeInteger(build) || build < 1) throw Error("Invalid React build number.");
  const bytes = await readFile(file),
    filename = path.basename(file),
    size = (await stat(file)).size;
  const manifest = Buffer.from(
    JSON.stringify({
      schema: 2,
      build,
      platform: "windows-x86_64",
      version,
      filename,
      size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      url: `https://github.com/ideas9009/The-Records-Project/releases/download/${build}/${encodeURIComponent(filename)}`,
    }) + "\n",
  );
  const privateKey = createPrivateKey(
    process.env.TRP_UPDATE_PRIVATE_KEY || (await readFile(keyPath)),
  );
  const expected = (
    await readFile(path.join(root, "updater/lib/public_key.dart"), "utf8")
  ).match(/updatePublicKey = '([^']+)'/)[1];
  if (
    Buffer.from(
      createPublicKey(privateKey).export({ format: "jwk" }).x,
      "base64url",
    ).toString("base64") !== expected
  )
    throw Error("Signing key does not match the app verification key.");
  await writeFile(
    path.join(path.dirname(file), "update-windows-x86_64.json"),
    manifest,
  );
  await writeFile(
    path.join(path.dirname(file), "update-windows-x86_64.json.sig"),
    sign(null, manifest, privateKey).toString("base64") + "\n",
  );
  console.log(
    "Created signed update metadata beside the MSI. Upload all three files to the matching build " +
      build +
      " GitHub release.",
  );
}
