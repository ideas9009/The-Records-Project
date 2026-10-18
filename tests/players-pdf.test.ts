import { it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPlayersPdf, type PdfProgress } from "../src/lib/players-pdf";
import { mkdir, writeFile } from "node:fs/promises";
const pixel = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD2cAAAAASUVORK5CYII=",
    "base64",
  ),
);
it("exports every username across two-column pages with at most four face requests active", async () => {
  let active = 0,
    peak = 0,
    calls = 0;
  const values: PdfProgress[] = [];
  const players = Array.from({ length: 65 }, (_, index) => ({
    name: "Player_" + String(index).padStart(2, "0"),
    uuid: String(index),
  }));
  const result = await buildPlayersPdf(
    players,
    (progress) => values.push(progress),
    async () => {
      active++;
      peak = Math.max(peak, active);
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return pixel;
    },
  );
  expect(calls).toBe(65);
  expect(peak).toBeLessThanOrEqual(4);
  expect(result.pages).toBe(2);
  expect(result.missing).toBe(0);
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2);
  expect(values.at(-1)).toMatchObject({
    completed: 65,
    total: 65,
    phase: "saving",
  });
  await mkdir("tmp/pdfs", { recursive: true });
  await writeFile("tmp/pdfs/earthmc-directory-qa.pdf", result.bytes);
});
it("keeps usernames when avatars fail and produces a valid PDF", async () => {
  const result = await buildPlayersPdf(
    [{ name: "UnavailableFace", uuid: "missing" }],
    () => {},
    async () => null,
  );
  expect(result.missing).toBe(1);
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
});
