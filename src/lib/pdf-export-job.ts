import type { PdfPlayer, PdfProgress } from "./players-pdf";
import { savePlayersPdf } from "./save-players-pdf";
type State = { busy: boolean; saving: boolean; progress: PdfProgress | null; message: string };
let state: State = { busy: false, saving: false, progress: null, message: "" };
let worker: Worker | null = null;
const listeners = new Set<() => void>();
export const pdfExportSnapshot = () => state;
export const subscribePdfExport = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function update(value: Partial<State>) { state = { ...state, ...value }; listeners.forEach(listener => listener()); }
export function dismissPdfExport() { if (!state.busy) update({ message: "" }); }
export function cancelPdfExport() {
  if (state.saving) return;
  worker?.terminate(); worker = null;
  update({ busy: false, saving: false, progress: null, message: "PDF export cancelled" });
}
export function startPdfExport(players: PdfPlayer[]) {
  if (state.busy || !players.length) return;
  update({ busy: true, saving: false, message: "", progress: { completed: 0, total: players.length, missing: 0, phase: "faces" } });
  try {
    const task = new Worker(new URL("../workers/players-pdf.worker.ts", import.meta.url), { type: "module" });
    worker = task;
    task.onmessage = async event => {
      if (worker !== task) return;
      const data = event.data;
      if (data.type === "progress") { update({ progress: data }); return; }
      task.terminate(); worker = null;
      if (data.type === "error") { update({ busy: false, progress: null, message: data.message }); return; }
      update({ saving: true });
      try {
        const saved = await savePlayersPdf(data.bytes);
        update({ message: saved + (data.missing ? ". Faces unavailable: " + data.missing : "") });
      } catch (error) { update({ message: error instanceof Error ? error.message : "Could not save the PDF." }); }
      finally { update({ busy: false, saving: false, progress: null }); }
    };
    task.onerror = () => { if (worker !== task) return; task.terminate(); worker = null; update({ busy: false, progress: null, message: "PDF export stopped. Please try a smaller selection." }); };
    task.postMessage({ players });
  } catch (error) { worker?.terminate(); worker = null; update({ busy: false, progress: null, message: error instanceof Error ? error.message : "Could not start PDF export." }); }
}
