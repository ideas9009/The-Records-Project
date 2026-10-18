import { PDFDocument } from "pdf-lib";
import type { PdfPlayer, PdfProgress } from "./players-pdf";
import { pdfChunkSize } from "./pdf-export-config";
export async function mergePlayerPdfs(parts: Uint8Array[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("EarthMC players"); pdf.setCreator("The Records Project");
  for (let index = 0; index < parts.length; index++) {
    const source = await PDFDocument.load(parts[index]);
    for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
    parts[index] = new Uint8Array();
    await pdf.flush();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { bytes: await pdf.save({ objectsPerTick: 30 }), pages: pdf.getPageCount() };
}
export async function buildParallelPlayersPdf(players: PdfPlayer[], workers: number, progress: (value: PdfProgress) => void) {
  const count = Math.min(workers, Math.ceil(players.length / pdfChunkSize));
  const chunks = Math.ceil(players.length / pdfChunkSize), parts: Uint8Array[] = new Array(chunks);
  const completed = new Array(chunks).fill(0), missing = new Array(chunks).fill(0);
  const pool: Worker[] = [];
  let next = 0;
  function report(phase: PdfProgress["phase"] = "faces") { progress({ completed: completed.reduce((a, b) => a + b, 0), total: players.length, missing: missing.reduce((a, b) => a + b, 0), phase }); }
  try {
    await Promise.all(Array.from({ length: count }, () => new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL("../workers/players-pdf-part.worker.ts", import.meta.url), { type: "module" });
      pool.push(worker);
      let index = -1;
      function dispatch() {
        if (next >= chunks) { worker.terminate(); resolve(); return; }
        index = next++;
        worker.postMessage({ players: players.slice(index * pdfChunkSize, (index + 1) * pdfChunkSize), options: { pageOffset: index * pdfChunkSize / 64, totalPages: Math.ceil(players.length / 64), concurrency: Math.max(1, Math.min(4, Math.floor(24 / count))) } });
      }
      worker.onmessage = event => {
        const data = event.data;
        if (data.type === "error") { reject(Error(data.message)); return; }
        if (data.type === "progress") { completed[index] = data.completed; missing[index] = data.missing; report(); return; }
        parts[index] = new Uint8Array(data.bytes);
        completed[index] = Math.min(pdfChunkSize, players.length - index * pdfChunkSize); missing[index] = data.missing;
        report(); dispatch();
      };
      worker.onerror = () => reject(Error("A PDF processing worker stopped."));
      dispatch();
    })));
    report("saving");
    return { ...await mergePlayerPdfs(parts), missing: missing.reduce((a, b) => a + b, 0) };
  } finally { pool.forEach(worker => worker.terminate()); }
}
