vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false), invoke: vi.fn(async () => 16) }));
import { isTauri, invoke } from "@tauri-apps/api/core";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/save-players-pdf", () => ({ savePlayersPdf: vi.fn(async () => "Saved to Downloads: players.pdf") }));
import { savePlayersPdf } from "../src/lib/save-players-pdf";
import { cancelPdfExport, dismissPdfExport, pdfExportSnapshot, startPdfExport, subscribePdfExport } from "../src/lib/pdf-export-job";
class FakeWorker {
 static latest: FakeWorker;
 onmessage: ((event: { data: unknown }) => unknown) | null = null;
 onerror: (() => void) | null = null;
 terminate = vi.fn(); postMessage = vi.fn();
 constructor() { FakeWorker.latest = this; }
}
afterEach(() => { cancelPdfExport(); dismissPdfExport(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(false); });
it("keeps processing after page subscribers leave and saves when complete", async () => {
 vi.stubGlobal("Worker", FakeWorker);
 const leave = subscribePdfExport(vi.fn());
 startPdfExport([{ name: "Player", uuid: "uuid" }]);
 const task = FakeWorker.latest;
 leave();
 expect(task.terminate).not.toHaveBeenCalled();
 task.onmessage!({ data: { type: "progress", completed: 1, total: 1, missing: 0, phase: "faces" } });
 expect(pdfExportSnapshot().progress?.completed).toBe(1);
 startPdfExport([{ name: "Duplicate", uuid: "other" }]);
 expect(FakeWorker.latest).toBe(task);
 await task.onmessage!({ data: { type: "done", bytes: new ArrayBuffer(8), missing: 0 } });
 expect(savePlayersPdf).toHaveBeenCalledOnce();
 expect(pdfExportSnapshot()).toMatchObject({ busy: false, message: "Saved to Downloads: players.pdf" });
});
it("terminates a cancelled job and ignores its late messages", () => {
 vi.stubGlobal("Worker", FakeWorker);
 startPdfExport([{ name: "Player", uuid: "uuid" }]);
 const task = FakeWorker.latest;
 cancelPdfExport();
 task.onmessage!({ data: { type: "done", bytes: new ArrayBuffer(8) } });
 expect(task.terminate).toHaveBeenCalledOnce();
 expect(savePlayersPdf).not.toHaveBeenCalled();
 expect(pdfExportSnapshot().busy).toBe(false);
});

it("uses the native logical-thread count for desktop worker allocation", async () => {
 vi.stubGlobal("Worker", FakeWorker); vi.mocked(isTauri).mockReturnValue(true);
 const players = Array.from({ length: 4000 }, (_, i) => ({ name: "Player" + i, uuid: String(i) }));
 startPdfExport(players);
 await Promise.resolve(); await Promise.resolve();
 expect(invoke).toHaveBeenCalledWith("export_cpu_threads");
 expect(FakeWorker.latest.postMessage).toHaveBeenCalledWith({ players, workers: 12 });
});
it("does not launch work if cancelled while native CPU discovery is pending", async () => {
 vi.stubGlobal("Worker", FakeWorker); vi.mocked(isTauri).mockReturnValue(true);
 startPdfExport([{ name: "Player", uuid: "uuid" }]);
 const task = FakeWorker.latest; cancelPdfExport();
 await Promise.resolve(); await Promise.resolve();
 expect(task.postMessage).not.toHaveBeenCalled();
});
