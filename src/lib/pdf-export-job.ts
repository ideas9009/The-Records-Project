import { isTauri, invoke } from "@tauri-apps/api/core";
import PdfWorker from "../workers/players-pdf.worker?worker";
import { pdfWorkerCount } from "./pdf-export-config";
import type { PdfPlayer, PdfProgress } from "./players-pdf";
import { savePlayersPdf } from "./save-players-pdf";
type State = { busy: boolean; saving: boolean; progress: PdfProgress | null; message: string };
type Job = { controller: AbortController; worker: Worker | null };
let state: State = { busy: false, saving: false, progress: null, message: "" };
let job: Job | null = null;
const listeners = new Set<() => void>();
export const pdfExportSnapshot = () => state;
export const subscribePdfExport = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function update(value: Partial<State>) { state = { ...state, ...value }; listeners.forEach(listener => listener()); }
export function dismissPdfExport() { if (!state.busy) update({ message: "" }); }
export function cancelPdfExport() {
  if (state.saving) return;
  job?.controller.abort(); job?.worker?.terminate(); job = null;
  update({ busy: false, saving: false, progress: null, message: "PDF export cancelled" });
}
function runWorker(current: Job, input: { players?: PdfPlayer[]; parts?: ArrayBuffer[] }, transfer: Transferable[] = []) {
  return new Promise<{ bytes: Uint8Array; pages: number; missing: number }>((resolve, reject) => {
    if (current.controller.signal.aborted) { reject(new DOMException("Export cancelled", "AbortError")); return; }
    const task = new PdfWorker(); current.worker = task;
    const timer = setTimeout(() => finish(Error("The PDF worker could not start. Please restart the app and try again.")), 15000);
    const abort = () => finish(new DOMException("Export cancelled", "AbortError"));
    function finish(error?: Error, result?: { bytes: Uint8Array; pages: number; missing: number }) {
      clearTimeout(timer); current.controller.signal.removeEventListener("abort", abort); task.terminate();
      if (current.worker === task) current.worker = null;
      if (error) reject(error); else resolve(result!);
    }
    current.controller.signal.addEventListener("abort", abort, { once: true });
    task.onmessage = event => {
      if (job !== current || current.controller.signal.aborted) return;
      clearTimeout(timer);
      const data = event.data;
      if (data.type === "ready") return;
      if (data.type === "progress") { update({ progress: data }); return; }
      if (data.type === "error") finish(Error(data.message));
      else finish(undefined, { bytes: new Uint8Array(data.bytes), pages: data.pages, missing: data.missing });
    };
    task.onerror = event => finish(Error("Could not start the PDF worker" + (event.message ? ": " + event.message : ".")));
    try { task.postMessage(input, transfer); } catch (error) { finish(error instanceof Error ? error : Error("Could not start PDF export.")); }
  });
}
export function startPdfExport(players: PdfPlayer[]) {
  if (state.busy || !players.length) return;
  const current: Job = { controller: new AbortController(), worker: null }; job = current;
  update({ busy: true, saving: false, message: "", progress: { completed: 0, total: players.length, missing: 0, phase: "faces" } });
  void (async () => {
    try {
      let result;
      if (isTauri()) {
        const threads = await invoke<number>("export_cpu_threads").catch(() => navigator.hardwareConcurrency || 1);
        if (job !== current) return;
        const { buildParallelPlayersPdf } = await import("./pdf-export-parallel");
        if (job !== current) return;
        result = await buildParallelPlayersPdf(players, pdfWorkerCount(threads, players.length), progress => { if (job === current) update({ progress }); }, {
          signal: current.controller.signal,
          merge: async parts => {
            const buffers = parts.map(part => part.buffer as ArrayBuffer);
            parts.length = 0;
            return runWorker(current, { parts: buffers }, buffers);
          },
        });
      } else result = await runWorker(current, { players });
      if (job !== current) return;
      update({ saving: true });
      const saved = await savePlayersPdf(result.bytes.buffer as ArrayBuffer);
      update({ message: saved + (result.missing ? ". Faces unavailable: " + result.missing : "") });
    } catch (error) {
      if (job === current) update({ message: error instanceof Error ? error.message : "Could not export the PDF." });
    } finally {
      if (job === current) { job = null; update({ busy: false, saving: false, progress: null }); }
    }
  })();
}
