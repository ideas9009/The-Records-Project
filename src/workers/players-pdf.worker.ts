import { buildPlayersPdf, type PdfPlayer } from "../lib/players-pdf";
self.onmessage = async (event: MessageEvent<{ players: PdfPlayer[] }>) => {
  try {
    const result = await buildPlayersPdf(event.data.players, (progress) =>
      self.postMessage({ type: "progress", ...progress }),
    );
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
