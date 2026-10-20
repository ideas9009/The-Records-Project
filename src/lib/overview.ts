import { apiRequest } from "./api";
export type Named = { name: string; uuid?: string };
export type ChartTown = Named & {
  population: number | null;
  balance: number | null;
};
export type NationOverview = {
  name: string;
  king?: Named;
  capital?: Named;
  stats?: {
    numTowns?: number;
    numResidents?: number;
    numTownBlocks?: number;
    balance?: number;
  };
  status?: { isOpen?: boolean; isNeutral?: boolean };
  board?: string;
  allies?: Named[];
  enemies?: Named[];
  towns?: Named[];
};
export const finiteStat = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export const votePercent = (remaining: unknown, target: unknown) => {
  const r = finiteStat(remaining),
    t = finiteStat(target);
  return r === null || t === null || t === 0
    ? null
    : Math.max(0, Math.min(100, Math.round((1 - r / t) * 100)));
};
export function rankTowns(
  towns: ChartTown[],
  metric: "population" | "balance",
) {
  return towns
    .filter((t) => finiteStat(t[metric]) !== null)
    .sort((a, b) => b[metric]! - a[metric]! || a.name.localeCompare(b.name));
}
export type OverviewData = {
  nation: NationOverview;
  towns: ChartTown[];
  chartError: string;
  checkedAt: string;
};
export async function loadNationOverview(force = false): Promise<OverviewData> {
  return apiRequest<OverviewData>("/api/overview", { networkOnly: force });
}
