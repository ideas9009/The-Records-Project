import PartWorker from "../workers/players-pdf-part.worker?worker";
import type { PdfPlayer, PdfProgress } from "./players-pdf";
import { pdfChunkSize } from "./pdf-export-config";
type Result = { bytes: Uint8Array; pages: number };
export async function buildParallelPlayersPdf(
  players: PdfPlayer[], workers: number, progress: (value: PdfProgress) => void,
  options: { signal?: AbortSignal; merge?: (parts: Uint8Array[]) => Promise<Result> } = {},
) {
  if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  const count = Math.max(1, Math.min(workers, Math.ceil(players.length / pdfChunkSize)));
  const chunks = Math.ceil(players.length / pdfChunkSize), parts: Uint8Array[] = new Array(chunks);
  const completed = new Array(chunks).fill(0), missing = new Array(chunks).fill(0);
  const pool: Worker[] = [], cleanup: (() => void)[] = [];
  let next = 0, stopped = false;
  function report(phase: PdfProgress["phase"] = "faces") { progress({ completed: completed.reduce((a, b) => a + b, 0), total: players.length, missing: missing.reduce((a, b) => a + b, 0), phase }); }
  try {
    await Promise.all(Array.from({ length: count }, () => new Promise<void>((resolve, reject) => {
      // All workers are created by the page, never by another worker (Windows WebView2).
      const worker = new PartWorker();
      pool.push(worker);
      let index = -1;
      const timer = setTimeout(() => reject(Error("A PDF worker could not start in Windows. Please restart the app and try again.")), 15000);
      const abort = () => reject(new DOMException("Export cancelled", "AbortError"));
      options.signal?.addEventListener("abort", abort, { once: true });
      cleanup.push(() => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); });
      function dispatch() {
        if (stopped || options.signal?.aborted) return;
        if (next >= chunks) { worker.terminate(); resolve(); return; }
        index = next++;
        worker.postMessage({ players: players.slice(index * pdfChunkSize, (index + 1) * pdfChunkSize), options: { pageOffset: index * pdfChunkSize / 64, totalPages: Math.ceil(players.length / 64), concurrency: Math.max(1, Math.min(4, Math.floor(24 / count))) } });
      }
      worker.onmessage = event => {
        if (stopped || options.signal?.aborted) return;
        clearTimeout(timer);
        const data = event.data;
        if (data.type === "ready") return;
        if (data.type === "error") { reject(Error(data.message)); return; }
        if (data.type === "progress") { completed[index] = data.completed; missing[index] = data.missing; report(); return; }
        parts[index] = new Uint8Array(data.bytes);
        completed[index] = Math.min(pdfChunkSize, players.length - index * pdfChunkSize); missing[index] = data.missing;
        report(); dispatch();
      };
      worker.onerror = event => reject(Error("Could not start a PDF processing worker" + (event.message ? ": " + event.message : ".")));
      dispatch();
    })));
    if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    report("saving");
    const merge = options.merge || (await import("./pdf-export-merge")).mergePlayerPdfs;
    return { ...await merge(parts), missing: missing.reduce((a, b) => a + b, 0) };
  } finally { stopped = true; cleanup.forEach(dispose => dispose()); pool.forEach(worker => worker.terminate()); }
}
