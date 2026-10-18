import { buildPlayersPdf, type PdfPlayer } from "../lib/players-pdf";
self.onmessage = async (event: MessageEvent<{ players: PdfPlayer[]; options: { pageOffset: number; totalPages: number; concurrency: number } }>) => {
  try {
    const result = await buildPlayersPdf(event.data.players, progress => self.postMessage({ type: "progress", ...progress }), undefined, event.data.options);
    const bytes = result.bytes.slice().buffer;
    self.postMessage({ type: "done", bytes, missing: result.missing }, { transfer: [bytes] });
  } catch { self.postMessage({ type: "error", message: "Could not process a PDF section." }); }
};
