export const earthMcPageSizes = [20, 40, 50, 75, 100, 500, 1000] as const;
export type EarthMcPageSize = (typeof earthMcPageSizes)[number] | "full";
const key = "records-earthmc-page-size";
export function readEarthMcPageSize(
  storage: Pick<Storage, "getItem">,
): EarthMcPageSize {
  try {
    const value = Number(storage.getItem(key));
    return earthMcPageSizes.includes(value as (typeof earthMcPageSizes)[number])
      ? (value as (typeof earthMcPageSizes)[number])
      : 20;
  } catch {
    return 20;
  }
}
export function rememberEarthMcPageSize(
  storage: Pick<Storage, "setItem">,
  value: EarthMcPageSize,
) {
  // Save the safe fallback before attempting a potentially expensive Full render.
  try {
    storage.setItem(key, String(value === "full" ? 20 : value));
  } catch {}
}
