import { useState, useSyncExternalStore } from "react";
import type { PdfPlayer } from "../lib/players-pdf";
import { pdfExportSnapshot, subscribePdfExport, startPdfExport, cancelPdfExport, dismissPdfExport } from "../lib/pdf-export-job";
import { Spinner } from "./Loading";
import "./players-pdf-export.css";
export default function PlayersPdfExport({ players, filtered, disabled }: { players: PdfPlayer[]; filtered: PdfPlayer[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { busy } = useSyncExternalStore(subscribePdfExport, pdfExportSnapshot);
  function start(selection: PdfPlayer[]) { setOpen(false); startPdfExport(selection); }
  return <div className="players-pdf-export" data-capture-exclude>
    <button disabled={disabled || busy} aria-expanded={open} onClick={() => setOpen(value => !value)}>{busy ? <Spinner/> : <span className="material-symbol" aria-hidden="true">picture_as_pdf</span>}{busy ? "Exporting PDF..." : "Export PDF"}</button>
    {open && <div className="pdf-export-options"><button disabled={!players.length} onClick={() => start(players)}>All EarthMC players ({players.length.toLocaleString()})</button><button disabled={!filtered.length} onClick={() => start(filtered)}>Current results ({filtered.length.toLocaleString()})</button></div>}
  </div>;
}
export function PdfExportBar() {
  const { busy, saving, progress, message } = useSyncExternalStore(subscribePdfExport, pdfExportSnapshot);
  if (!busy && !message) return null;
  const completed = progress?.completed || 0, total = progress?.total || 1;
  return <section className="pdf-export-dock" aria-label="PDF export" data-capture-exclude>
    <div className="pdf-export-dock-row"><span role="status">{busy && <Spinner/>}{busy ? saving ? "Saving PDF to Downloads..." : progress?.phase === "saving" ? "Preparing PDF file..." : `Exporting PDF - ${completed.toLocaleString()} / ${total.toLocaleString()} players` : message}</span>
      {busy ? <button disabled={saving} onClick={cancelPdfExport}>Cancel export</button> : <button onClick={dismissPdfExport} aria-label="Dismiss PDF export status"><span className="material-symbol" aria-hidden="true">close</span></button>}
    </div>
    {busy && <progress aria-label="PDF export progress" max={total} value={completed}/>}
  </section>;
}
