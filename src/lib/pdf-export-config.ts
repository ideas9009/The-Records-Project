export const pdfChunkSize = 256;
export function pdfWorkerCount(threads: number, playerCount: number) {
  const available = Number.isFinite(threads) ? Math.max(1, Math.floor(threads)) : 1;
  return Math.min(Math.max(1, Math.floor(available * 0.8)), Math.max(1, Math.ceil(playerCount / pdfChunkSize)));
}
