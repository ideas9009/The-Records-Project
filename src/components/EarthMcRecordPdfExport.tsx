import { useEffect, useRef, useState } from "react";
import PdfWorker from "../workers/earthmc-record-pdf.worker?worker";
import type { RecordPdfInput } from "../lib/earthmc-record-pdf";
import { savePlayersPdf } from "../lib/save-players-pdf";
import { Spinner } from "./Loading";
import "./earthmc-record-pdf-export.css";
export default function EarthMcRecordPdfExport({
  kind,
  record,
  checkedAt,
  disabled = false,
}: {
  kind: RecordPdfInput["kind"];
  record?: Record<string, unknown>;
  checkedAt?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const job = useRef<{
    worker: Worker | null;
    controller: AbortController;
  } | null>(null);
  useEffect(
    () => () => {
      job.current?.controller.abort();
      job.current?.worker?.terminate();
      job.current = null;
    },
    [],
  );
  function cancel() {
    job.current?.controller.abort();
    job.current?.worker?.terminate();
    job.current = null;
    setBusy(false);
    setSaving(false);
    setMessage("PDF export cancelled.");
  }
  async function start() {
    if (!record || !checkedAt || job.current) return;
    const current = {
      worker: null as Worker | null,
      controller: new AbortController(),
    };
    job.current = current;
    const input = { kind, record, checkedAt };
    setBusy(true);
    setMessage("Preparing PDF...");
    try {
      const response = await fetch("/fonts/NotoSans-Regular.ttf", {
        signal: current.controller.signal,
      });
      if (!response.ok)
        throw Error("The PDF font could not load. Please try again.");
      const font = await response.arrayBuffer();
      if (job.current !== current) return;
      const result = await new Promise<{ bytes: ArrayBuffer; missing: number }>(
        (resolve, reject) => {
          const worker = new PdfWorker();
          current.worker = worker;
          const timer = setTimeout(
            () =>
              finish(
                Error("The PDF exporter could not start. Please try again."),
              ),
            15000,
          );
          const abort = () =>
            finish(new DOMException("Cancelled", "AbortError"));
          function finish(
            error?: Error,
            result?: { bytes: ArrayBuffer; missing: number },
          ) {
            clearTimeout(timer);
            current.controller.signal.removeEventListener("abort", abort);
            worker.terminate();
            current.worker = null;
            if (error) reject(error);
            else resolve(result!);
          }
          current.controller.signal.addEventListener("abort", abort, {
            once: true,
          });
          worker.onmessage = (event) => {
            const data = event.data;
            if (data.type === "ready") {
              clearTimeout(timer);
              return;
            }
            if (data.type === "progress") {
              setMessage(
                data.phase === "faces"
                  ? "Adding player faces: " +
                      data.completed +
                      " / " +
                      data.total
                  : "Writing town/player information...",
              );
              return;
            }
            if (data.type === "error") finish(Error(data.message));
            else if (data.type === "done") finish(undefined, data);
          };
          worker.onerror = () =>
            finish(Error("Could not create the PDF. Please try again."));
          worker.postMessage({ input, font }, [font]);
        },
      );
      if (job.current !== current) return;
      setSaving(true);
      setMessage("Saving PDF...");
      const saved = await savePlayersPdf(
        result.bytes,
        kind,
        typeof record.name === "string" ? record.name : "record",
      );
      if (job.current === current)
        setMessage(
          saved +
            (result.missing
              ? ". Some faces were unavailable; all names are included."
              : ""),
        );
    } catch (error) {
      if (job.current === current)
        setMessage(
          error instanceof Error ? error.message : "Could not export PDF.",
        );
    } finally {
      if (job.current === current) {
        job.current = null;
        setBusy(false);
        setSaving(false);
      }
    }
  }
  return (
    <div className="earthmc-record-export" data-capture-exclude>
      <button
        onClick={start}
        disabled={disabled || busy || !record}
        aria-label={"Export " + kind + " information as PDF"}
      >
        {busy ? (
          <Spinner />
        ) : (
          <span className="material-symbol" aria-hidden="true">
            picture_as_pdf
          </span>
        )}
        {busy ? "Exporting PDF..." : "Export PDF"}
      </button>
      {busy && !saving && <button onClick={cancel}>Cancel</button>}
      {message && (
        <span className="citizens-muted" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
