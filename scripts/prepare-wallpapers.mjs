import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(project, "wallpapers"),
  output = path.join(project, "public", "wallpapers");
await fs.mkdir(output, { recursive: true });
if (!(await fs.stat(source).catch(()=>null))) {
  const saved=JSON.parse(await fs.readFile(path.join(project,"src","lib","wallpapers.json"),"utf8"));
  for(const wallpaper of saved)for(const asset of [wallpaper.url,wallpaper.thumbnail])await fs.access(path.join(project,"public",asset.replace(/^\//,"")));
  console.log(`Using ${saved.length} prepared wallpapers.`);
  process.exit(0);
}
sharp.concurrency(2);
const files = (await fs.readdir(source))
  .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  .sort();
const catalog = [];
for (const [index, file] of files.entries()) {
  const stem = path.parse(file).name;
  const image = path.join(output, stem + ".webp"),
    thumbnail = path.join(output, stem + ".thumb.webp");
  const input = path.join(source, file),
    modified = (await fs.stat(input)).mtimeMs;
  const current = await Promise.all(
    [image, thumbnail].map((p) =>
      fs
        .stat(p)
        .then((s) => s.mtimeMs >= modified)
        .catch(() => false),
    ),
  );
  if (!current.every(Boolean)) {
    await sharp(input).webp({ quality: 90 }).toFile(image);
    await sharp(input)
      .resize({
        width: 320,
        height: 180,
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(thumbnail);
  }
  catalog.push({
    name: "Wallpaper " + (index + 1),
    file,
    url: "/wallpapers/" + path.basename(image),
    thumbnail: "/wallpapers/" + path.basename(thumbnail),
    legacyUrl: "/wallpapers/" + file,
  });
}
const expected = new Set(
  catalog.flatMap((w) => [path.basename(w.url), path.basename(w.thumbnail)]),
);
for (const name of await fs.readdir(output)) {
  const target = path.resolve(output, name);
  if (path.dirname(target) !== output)
    throw Error("Generated asset path escaped its directory.");
  if (/\.(png|jpe?g|webp)$/i.test(name) && !expected.has(name))
    await fs.unlink(target);
}
await fs.writeFile(
  path.join(project, "src", "lib", "wallpapers.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(
  `Prepared ${catalog.length} wallpapers from the project's wallpapers folder.`,
);
