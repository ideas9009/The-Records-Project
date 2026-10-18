import { isTauri } from "@tauri-apps/api/core";
export async function savePlayersPdf(bytes: ArrayBuffer) {
  const filename =
    "TRP-EarthMC-players-" + new Date().toISOString().replace(/[:.]/g, "-") + ".pdf";
  if (isTauri()) {
    const { downloadDir, join } = await import("@tauri-apps/api/path");
    const path = await join(await downloadDir(), filename);
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(path, new Uint8Array(bytes));
    return "Saved to Downloads: " + filename;
  }
  if (import.meta.env.DEV) {
    const check = await fetch("/__trp_capture/available").catch(() => null);
    if (check?.ok && (await check.json()).available) {
      const response = await fetch("/__trp_capture/save-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-TRP-Capture": "1",
          "X-TRP-Filename": filename,
        },
        body: bytes,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not save the PDF.");
      return "Saved to Downloads: " + result.filename;
    }
  }
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "PDF download requested";
}
