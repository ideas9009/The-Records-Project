import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false), invoke: vi.fn(async () => 16) }));
vi.mock("../src/lib/save-players-pdf", () => ({ savePlayersPdf: vi.fn(async () => "Saved to Downloads: players.pdf") }));
vi.mock("../src/lib/pdf-export-parallel", () => ({ buildParallelPlayersPdf: vi.fn(async () => ({ bytes: new Uint8Array(8), pages: 1, missing: 0 })) }));
import { isTauri, invoke } from "@tauri-apps/api/core";
import { savePlayersPdf } from "../src/lib/save-players-pdf";
import { buildParallelPlayersPdf } from "../src/lib/pdf-export-parallel";
import { cancelPdfExport, dismissPdfExport, pdfExportSnapshot, startPdfExport, subscribePdfExport } from "../src/lib/pdf-export-job";
class FakeWorker {
 static latest: FakeWorker;
 onmessage: ((event: { data: unknown }) => unknown) | null = null;
 onerror: ((event: { message: string }) => void) | null = null;
 terminate = vi.fn(); postMessage = vi.fn();
 constructor() { FakeWorker.latest = this; }
}
afterEach(() => { cancelPdfExport(); dismissPdfExport(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(false); vi.useRealTimers(); });
it("keeps processing after page subscribers leave and saves when complete", async () => {
 vi.stubGlobal("Worker", FakeWorker);
 const leave = subscribePdfExport(vi.fn());
 startPdfExport([{ name: "Player", uuid: "uuid" }]);
 const task = FakeWorker.latest; leave();
 expect(task.terminate).not.toHaveBeenCalled();
 task.onmessage!({ data: { type: "ready" } });
 expect(pdfExportSnapshot().busy).toBe(true);
 task.onmessage!({ data: { type: "progress", completed: 1, total: 1, missing: 0, phase: "faces" } });
 expect(pdfExportSnapshot().progress?.completed).toBe(1);
 startPdfExport([{ name: "Duplicate", uuid: "other" }]);
 expect(FakeWorker.latest).toBe(task);
 task.onmessage!({ data: { type: "done", bytes: new ArrayBuffer(8), missing: 0 } });
 await vi.waitFor(() => expect(pdfExportSnapshot().busy).toBe(false));
 expect(savePlayersPdf).toHaveBeenCalledOnce();
 expect(pdfExportSnapshot().message).toBe("Saved to Downloads: players.pdf");
});
it("terminates a cancelled job and ignores late messages", async () => {
 vi.stubGlobal("Worker", FakeWorker);
 startPdfExport([{ name: "Player", uuid: "uuid" }]);
 const task = FakeWorker.latest; cancelPdfExport();
 task.onmessage!({ data: { type: "done", bytes: new ArrayBuffer(8) } });
 await Promise.resolve();
 expect(task.terminate).toHaveBeenCalledOnce(); expect(savePlayersPdf).not.toHaveBeenCalled();
 expect(pdfExportSnapshot().busy).toBe(false);
});
it("starts the desktop pool from the page using the native CPU count", async () => {
 vi.stubGlobal("Worker", FakeWorker); vi.mocked(isTauri).mockReturnValue(true);
 const players = Array.from({ length: 4000 }, (_, i) => ({ name: "Player" + i, uuid: String(i) }));
 startPdfExport(players);
 await vi.waitFor(() => expect(pdfExportSnapshot().busy).toBe(false));
 expect(invoke).toHaveBeenCalledWith("export_cpu_threads");
 expect(buildParallelPlayersPdf).toHaveBeenCalledWith(players, 12, expect.any(Function), expect.objectContaining({ signal: expect.any(AbortSignal), merge: expect.any(Function) }));
 expect(savePlayersPdf).toHaveBeenCalledOnce();
});
it("does not launch work if cancelled during native CPU discovery", async () => {
 vi.stubGlobal("Worker", FakeWorker); vi.mocked(isTauri).mockReturnValue(true);
 startPdfExport([{ name: "Player", uuid: "uuid" }]); cancelPdfExport();
 await Promise.resolve(); await Promise.resolve();
 expect(buildParallelPlayersPdf).not.toHaveBeenCalled(); expect(savePlayersPdf).not.toHaveBeenCalled();
});
it("reports a worker startup failure instead of suggesting a smaller directory", async () => {
 vi.stubGlobal("Worker", FakeWorker); startPdfExport([{ name: "Player", uuid: "uuid" }]);
 FakeWorker.latest.onerror!({ message: "Could not load bundled script" });
 await vi.waitFor(() => expect(pdfExportSnapshot().busy).toBe(false));
 expect(pdfExportSnapshot().message).toContain("Could not load bundled script");
 expect(savePlayersPdf).not.toHaveBeenCalled();
});
it("times out a worker that never starts", async () => {
 vi.useFakeTimers(); vi.stubGlobal("Worker", FakeWorker);
 startPdfExport([{ name: "Player", uuid: "uuid" }]);
 await vi.advanceTimersByTimeAsync(15000);
 expect(pdfExportSnapshot().busy).toBe(false); expect(pdfExportSnapshot().message).toContain("could not start");
 expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
});
