import { PDFDocument, rgb, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { smallFace, type PdfPlayer } from "./players-pdf";
export type RecordPdfInput = {
  kind: "town" | "player";
  record: Record<string, unknown>;
  checkedAt: string;
};
export type RecordPdfRow = {
  text: string;
  heading?: boolean;
  person?: PdfPlayer;
};
export type RecordPdfProgress = {
  phase: "faces" | "document";
  completed: number;
  total: number;
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const clean = (v: unknown) =>
  String(v)
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a7[0-9a-fk-or]/gi, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const human = (key: string) => key.includes(":") ? key :
  (
    ({
      uuid: "UUID",
      stats: "Statistics",
      perms: "Permissions",
      timestamps: "Dates",
      numTownBlocks: "Claimed chunks",
      townBlocks: "Claimed chunks",
      townblocks: "Claimed chunks",
      homeBlock: "Home chunk",
      numResidents: "Residents",
      balance: "Bank balance",
      bankhistory: "Bank history",
    }) as Record<string, string>
  )[key] ||
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
const dates = new Set([
  "registered",
  "joinedNationAt",
  "joinedTownAt",
  "claimedAt",
  "lastOnline",
  "ruinedAt",
]);
const playerFields = new Set([
  "residents",
  "trusted",
  "outlaws",
  "friends",
  "mayor",
  "owner",
  "ranks",
]);
function person(value: unknown): PdfPlayer | undefined {
  const p = object(value),
    name = p.name,
    id = p.uuid;
  if (typeof name !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(name)) return;
  return {
    name,
    uuid: typeof id === "string" && /^[0-9a-f-]{32,36}$/i.test(id) ? id : name,
  };
}
export function recordPdfRows(input: RecordPdfInput): RecordPdfRow[] {
  const rows: RecordPdfRow[] = [];
  const identities = new Map<string, PdfPlayer>();
  const collect = (v: unknown, depth = 0) => {
    if (depth > 20) return;
    const p = person(v);
    if (p) identities.set(p.name.toLowerCase(), p);
    if (Array.isArray(v)) v.forEach((x) => collect(x, depth + 1));
    else if (v && typeof v === "object")
      Object.values(v).forEach((x) => collect(x, depth + 1));
  };
  // Only player collections can supply identities; town and nation UUIDs are not player avatars.
  for (const [key, value] of Object.entries(input.record))
    if (playerFields.has(key)) collect(value);
  const push = (text: string, heading = false, p?: PdfPlayer) =>
    rows.push({
      text: clean(text),
      ...(heading ? { heading: true } : {}),
      ...(p ? { person: p } : {}),
    });
  const scalar = (v: unknown, key: string) =>
    v == null
      ? "Not provided"
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : typeof v === "number" &&
            dates.has(key) &&
            v > 0 &&
            v < 8640000000000000
          ? new Date(v).toISOString().replace("T", " ").replace(".000Z", " UTC")
          : typeof v === "number"
            ? String(v)
            : clean(v);
  const walk = (
    value: unknown,
    path: string,
    key: string,
    players = false,
    depth = 0,
  ) => {
    const p = players ? person(value) : undefined;
    if (p) {
      push(
        path +
          ": " +
          p.name +
          " (UUID: " +
          String(object(value).uuid ?? "Not provided") +
          ")",
        false,
        p,
      );
      for (const [child, item] of Object.entries(object(value)))
        if (!["name", "uuid"].includes(child))
          walk(item, path + " / " + human(child), child, false, depth + 1);
      return;
    }
    if (
      typeof value === "string" &&
      players &&
      /^[A-Za-z0-9_]{3,16}$/.test(value)
    ) {
      push(
        path + ": " + value,
        false,
        identities.get(value.toLowerCase()) || { name: value, uuid: value },
      );
      return;
    }
    if (Array.isArray(value)) {
      if (!value.length) {
        push(path + ": None");
        return;
      }
      if (value.every((v) => typeof v === "number") && value.length <= 4) {
        push(path + ": [" + value.join(", ") + "]");
        return;
      }
      value.forEach((item, index) =>
        walk(item, path + " / " + (index + 1), key, players, depth + 1),
      );
      return;
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length) push(path + ": None");
      else
        for (const [child, item] of entries)
          walk(
            item,
            path ? path + " / " + human(child) : human(child),
            child,
            players || playerFields.has(child),
            depth + 1,
          );
      return;
    }
    push(
      path +
        ": " +
        scalar(value, key) +
        (key === "balance" && typeof value === "number" ? " Gold" : ""),
    );
  };
  for (const [key, value] of Object.entries(input.record)) {
    if (input.kind === "town" && key === "quarters") continue;
    push(human(key), true);
    if (key === "perms") {
      const groups =
        input.kind === "town"
          ? ["Residents", "Nation members", "Allies", "Outsiders"]
          : ["Friends", "Town members", "Allies", "Outsiders"];
      for (const [action, permissions] of Object.entries(object(value)))
        if (Array.isArray(permissions))
          push(
            human(action) +
              ": " +
              permissions
                .map(
                  (v, i) =>
                    (groups[i] || "Group " + (i + 1)) +
                    ": " +
                    scalar(v, action),
                )
                .join("; "),
          );
        else walk(permissions, human(action), action);
    } else if (input.kind === "player" && key === "name") {
      walk(value, "Name", key);
      const p = person(input.record);
      if (p) push("Minecraft player: " + p.name, false, p);
    } else walk(value, "", key, playerFields.has(key));
  }
  return rows.map((row) => ({ ...row, text: row.text.replace(/^: /, "").replace(/^ \/ /, "") }));
}
export async function buildEarthMcRecordPdf(
  input: RecordPdfInput,
  fontBytes: Uint8Array,
  progress: (p: RecordPdfProgress) => void = () => {},
  face: (p: PdfPlayer) => Promise<Uint8Array | null> = smallFace,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  let escaped = 0;
  const safe = (text: string) =>
    [...clean(text)]
      .map((c) => {
        if (c === "\n" || supported.has(c.codePointAt(0)!)) return c;
        escaped++;
        return "[U+" + c.codePointAt(0)!.toString(16).toUpperCase() + "]";
      })
      .join("");
  const rows = recordPdfRows(input),
    people = [
      ...new Map(
        rows.filter((r) => r.person).map((r) => [r.person!.uuid, r.person!]),
      ).values(),
    ];
  const images = new Map<string, PDFImage>();
  let missing = 0;
  for (let start = 0; start < people.length; start += 4) {
    const batch = people.slice(start, start + 4),
      results = await Promise.all(batch.map((p) => face(p).catch(() => null)));
    for (let i = 0; i < batch.length; i++)
      try {
        if (!results[i]) throw Error();
        images.set(batch[i].uuid, await pdf.embedPng(results[i]!));
      } catch {
        missing++;
      }
    progress({
      phase: "faces",
      completed: Math.min(start + 4, people.length),
      total: people.length,
    });
  }
  const name =
    typeof input.record.name === "string"
      ? clean(input.record.name)
      : "Unnamed";
  const title = "EarthMC " + input.kind + " - " + name;
  pdf.setTitle(title);
  pdf.setCreator("The Records Project");
  let page!: PDFPage,
    y = 0;
  const pages: PDFPage[] = [];
  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    pages.push(page);
    y = 786;
    page.drawText(safe("The Records Project | EarthMC " + input.kind), {
      x: 42,
      y: 810,
      font,
      size: 9,
      color: rgb(0.3, 0.3, 0.3),
    });
  };
  addPage();
  const ensure = (height: number) => {
    if (y - height < 48) addPage();
  };
  const wrap = (text: string, size: number, width: number) => {
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
      if (!word) continue;
      const candidate = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      for (const c of word) {
        if (current && font.widthOfTextAtSize(current + c, size) > width) {
          lines.push(current);
          current = "";
        }
        current += c;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };
  const text = (value: string, size = 10, indent = 0) => {
    for (const line of wrap(safe(value), size, 511.28 - indent)) {
      ensure(size + 5);
      page.drawText(line, { x: 42 + indent, y, font, size });
      y -= size + 5;
    }
  };
  text(title, 18);
  y -= 7;
  text("Source: EarthMC API v4", 9);
  text(
    "Data checked: " +
      (Number.isNaN(Date.parse(input.checkedAt))
        ? input.checkedAt
        : new Date(input.checkedAt).toISOString()),
    9,
  );
  text("Exported: " + new Date().toISOString(), 9);
  if (input.kind === "town")
    text(
      "Town record only. Individual apartment and quarter records are excluded.",
      9,
    );
  y -= 12;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.heading) {
      ensure(48);
      y -= 7;
      text(row.text, 12);
      y -= 3;
    } else if (row.person) {
      ensure(33);
      const image = images.get(row.person.uuid);
      if (image)
        page.drawImage(image, { x: 42, y: y - 14, width: 22, height: 22 });
      const before = y;
      text(row.text, 10, 32);
      if (before - y < 30) y = before - 30;
    } else text(row.text);
    if (i % 100 === 0) {
      progress({ phase: "document", completed: i, total: rows.length });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (missing) {
    y -= 10;
    text(
      "Some player faces were unavailable (" +
        missing +
        "). All player names are included.",
      9,
    );
  }
  if (escaped) {
    y -= 10;
    text(
      "Characters unavailable in this font are preserved using their Unicode code points, for example [U+4EAC].",
      9,
    );
  }
  pages.forEach((p, i) =>
    p.drawText("Page " + (i + 1) + " of " + pages.length, {
      x: 42,
      y: 25,
      font,
      size: 9,
      color: rgb(0.3, 0.3, 0.3),
    }),
  );
  progress({ phase: "document", completed: rows.length, total: rows.length });
  return {
    bytes: await pdf.save({ objectsPerTick: 30 }),
    pages: pages.length,
    missing,
  };
}
