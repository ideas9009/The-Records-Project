import { buildParallelPlayersPdf } from "../lib/pdf-export-parallel";
import { buildPlayersPdf, type PdfPlayer } from "../lib/players-pdf";
self.onmessage = async (event: MessageEvent<{ players: PdfPlayer[]; workers?: number }>) => {
  try {
    const report = (progress: import("../lib/players-pdf").PdfProgress) => self.postMessage({ type: "progress", ...progress });
    const result = (event.data.workers || 1) > 1
      ? await buildParallelPlayersPdf(event.data.players, event.data.workers!, report)
      : await buildPlayersPdf(event.data.players, report);
    const bytes = result.bytes.slice().buffer;
    self.postMessage(
      { type: "done", bytes, missing: result.missing, pages: result.pages },
      { transfer: [bytes] },
    );
  } catch {
    self.postMessage({
      type: "error",
      message: "Could not create the PDF. Please try a smaller selection.",
    });
  }
};
