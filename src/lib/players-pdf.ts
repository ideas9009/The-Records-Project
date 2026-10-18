import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export type PdfPlayer = { name: string; uuid: string };
export type PdfProgress = {
  completed: number;
  total: number;
  missing: number;
  phase: "faces" | "saving";
};
export async function smallFace(player: PdfPlayer): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      const response = await fetch(
        "https://mc-heads.net/avatar/" + encodeURIComponent(player.uuid) + "/8",
        {
          signal: AbortSignal.timeout(6000),
          cache: "force-cache",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      if (response.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length <= 65536 ? bytes : null;
    } catch {
      return null;
    }
  return null;
}
export async function buildPlayersPdf(
  players: PdfPlayer[],
  progress: (value: PdfProgress) => void,
  face: (player: PdfPlayer) => Promise<Uint8Array | null> = smallFace,
) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle("EarthMC players");
  pdf.setCreator("The Records Project");
  const perPage = 64,
    pages = Math.max(1, Math.ceil(players.length / perPage));
  let missing = 0;
  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText("EarthMC players", { x: 36, y: 812, size: 11, font });
    page.drawText("Page " + (pageIndex + 1) + " of " + pages, {
      x: 36,
      y: 20,
      size: 9,
      font,
    });
    const offset = pageIndex * perPage,
      entries = players.slice(offset, offset + perPage);
    for (let start = 0; start < entries.length; start += 4) {
      const batch = entries.slice(start, start + 4),
        images = await Promise.all(
          batch.map((player) => face(player).catch(() => null)),
        );
      for (let item = 0; item < batch.length; item++) {
        const position = start + item,
          column = position % 2,
          row = Math.floor(position / 2),
          x = 36 + column * 271.64,
          y = 780 - row * 22,
          player = batch[item];
        let imageDrawn = false;
        if (images[item])
          try {
            const image = await pdf.embedPng(images[item]!);
            page.drawImage(image, { x, y, width: 16, height: 16 });
            imageDrawn = true;
          } catch {}
        if (!imageDrawn) {
          missing++;
          page.drawRectangle({
            x,
            y,
            width: 16,
            height: 16,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
          });
        }
        page.drawText(
          player.name.replace(/[^a-z0-9_]/gi, "").slice(0, 16) || "Unknown",
          { x: x + 23, y: y + 4, size: 10, font },
        );
      }
      progress({
        completed: offset + start + batch.length,
        total: players.length,
        missing,
        phase: "faces",
      });
    }
    // Embed and release decoded face buffers after each page; retain only PDF objects.
    await pdf.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  progress({
    completed: players.length,
    total: players.length,
    missing,
    phase: "saving",
  });
  return { bytes: await pdf.save({ objectsPerTick: 30 }), missing, pages };
}
