import { PDFDocument } from "pdf-lib";
export async function mergePlayerPdfs(parts: Uint8Array[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("EarthMC players"); pdf.setCreator("The Records Project");
  for (let index = 0; index < parts.length; index++) {
    const source = await PDFDocument.load(parts[index]);
    for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
    parts[index] = new Uint8Array();
    await pdf.flush();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { bytes: await pdf.save({ objectsPerTick: 30 }), pages: pdf.getPageCount() };
}
