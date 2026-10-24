import {
  buildEarthMcRecordPdf,
  type RecordPdfInput,
} from "../lib/earthmc-record-pdf";
const worker = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent) => void) | null;
};
worker.postMessage({ type: "ready" });
worker.onmessage = async (
  event: MessageEvent<{ input: RecordPdfInput; font: ArrayBuffer }>,
) => {
  try {
    const result = await buildEarthMcRecordPdf(
      event.data.input,
      new Uint8Array(event.data.font),
      (p) => worker.postMessage({ type: "progress", ...p }),
    );
    const bytes = result.bytes.buffer as ArrayBuffer;
    worker.postMessage(
      { type: "done", bytes, pages: result.pages, missing: result.missing },
      [bytes],
    );
  } catch {
    worker.postMessage({
      type: "error",
      message: "Could not create the PDF. Please try again.",
    });
  }
};
