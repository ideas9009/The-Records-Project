import { afterEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPlayersPdf, type PdfPlayer, type PdfProgress } from "../src/lib/players-pdf";
import { buildParallelPlayersPdf } from "../src/lib/pdf-export-parallel";
import { mergePlayerPdfs } from "../src/lib/pdf-export-merge";
import { pdfWorkerCount } from "../src/lib/pdf-export-config";
import { mkdir, writeFile } from "node:fs/promises";
afterEach(() => vi.unstubAllGlobals());
it("budgets 80% of desktop logical threads and avoids idle workers on small exports", () => {
 expect(pdfWorkerCount(16, 47000)).toBe(12);
 expect(pdfWorkerCount(8, 47000)).toBe(6);
 expect(pdfWorkerCount(1, 47000)).toBe(1);
 expect(pdfWorkerCount(NaN, 47000)).toBe(1);
 expect(pdfWorkerCount(16, 59)).toBe(1);
 expect(pdfWorkerCount(16, 300)).toBe(2);
});
it("merges completed sections in original order and releases their buffers", async () => {
 const parts = await Promise.all([200, 300].map(async width => { const pdf = await PDFDocument.create(); pdf.addPage([width, 400]); return pdf.save(); }));
 const merged = await mergePlayerPdfs(parts);
 const pdf = await PDFDocument.load(merged.bytes);
 expect(pdf.getPages().map(page => page.getWidth())).toEqual([200, 300]);
 expect(parts.every(part => part.length === 0)).toBe(true);
});
it("processes multiple sections concurrently with accurate progress and one ordered PDF", async () => {
 let created = 0, active = 0, peak = 0;
 const requests: { concurrency: number; pageOffset: number; totalPages: number }[] = [];
 class PartWorker {
   onmessage: ((event: { data: unknown }) => void) | null = null;
   onerror: (() => void) | null = null;
   terminate() {}
   constructor() { created++; }
   postMessage(data: { players: PdfPlayer[]; options: { concurrency: number; pageOffset: number; totalPages: number } }) {
     requests.push(data.options); active++; peak = Math.max(peak, active);
     void buildPlayersPdf(data.players, value => this.onmessage?.({ data: { type: "progress", ...value } }), async () => null, data.options).then(result => {
       active--;
       this.onmessage?.({ data: { type: "done", bytes: result.bytes.buffer, missing: result.missing } });
     }).catch(() => this.onerror?.());
   }
 }
 vi.stubGlobal("Worker", PartWorker);
 const values: PdfProgress[] = [];
 const players = Array.from({ length: 320 }, (_, index) => ({ name: "Player_" + String(index).padStart(3, "0"), uuid: String(index) }));
 const result = await buildParallelPlayersPdf(players, 2, progress => values.push(progress));
 expect(created).toBe(2); expect(peak).toBe(2);
 expect(requests.map(item => item.pageOffset)).toEqual([0, 4]);
 expect(requests.every(item => item.totalPages === 5 && item.concurrency <= 4)).toBe(true);
 expect(result.pages).toBe(5); expect(result.missing).toBe(320);
 expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(5);
 expect(values.at(-1)).toMatchObject({ completed: 320, total: 320, phase: "saving" });
 expect(values.every((value, index) => !index || value.completed >= values[index - 1].completed)).toBe(true);
 await mkdir("tmp/pdfs", { recursive: true }); await writeFile("tmp/pdfs/parallel-directory-qa.pdf", result.bytes);
});

it("cancels every page-owned worker without merging or saving partial output", async () => {
 const workers: IdleWorker[] = [];
 class IdleWorker {
   onmessage: ((event: { data: unknown }) => void) | null = null;
   onerror: (() => void) | null = null;
   terminate = vi.fn(); postMessage = vi.fn();
   constructor() { workers.push(this); }
 }
 vi.stubGlobal("Worker", IdleWorker);
 const controller = new AbortController(), merge = vi.fn();
 const players = Array.from({ length: 300 }, (_, i) => ({ name: "Player" + i, uuid: String(i) }));
 const pending = buildParallelPlayersPdf(players, 2, () => {}, { signal: controller.signal, merge });
 controller.abort();
 await expect(pending).rejects.toMatchObject({ name: "AbortError" });
 expect(workers).toHaveLength(2); expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
 expect(merge).not.toHaveBeenCalled();
 const calls = workers[0].postMessage.mock.calls.length;
 workers[0].onmessage!({ data: { type: "done", bytes: new ArrayBuffer(0), missing: 0 } });
 expect(workers[0].postMessage).toHaveBeenCalledTimes(calls);
});
