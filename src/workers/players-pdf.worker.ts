import { buildPlayersPdf, type PdfPlayer } from "../lib/players-pdf";
import { mergePlayerPdfs } from "../lib/pdf-export-merge";
self.onmessage = async (event: MessageEvent<{ players?: PdfPlayer[]; parts?: ArrayBuffer[] }>) => {
  try {
    const result = event.data.parts
      ? { ...await mergePlayerPdfs(event.data.parts.map(part => new Uint8Array(part))), missing: 0 }
      : await buildPlayersPdf(event.data.players || [], progress => self.postMessage({ type: "progress", ...progress }));
    const bytes = result.bytes.slice().buffer;
    self.postMessage({ type: "done", bytes, missing: result.missing, pages: result.pages }, { transfer: [bytes] });
  } catch (error) {
    self.postMessage({ type: "error", message: "Could not prepare the PDF file" + (error instanceof Error ? ": " + error.message : ".") });
  }
};
self.postMessage({ type: "ready" });
