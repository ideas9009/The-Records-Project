import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "./api";
import { PREVIEW_MODE, previewAccount } from "./runtime-mode";
import sampleTowns from "../data/towns.json";
export type Town = Omit<
  (typeof sampleTowns)[number],
  "earthmcResidents" | "claimedChunks"
> & {
  earthmcResidents: number | null;
  claimedChunks: number | null;
  mayorUid: string;
  mayorUids?: string[];
  mayorNames?: string[];
  type?: string;
  version?: number;
};
type TownStats = Record<
  string,
  { earthmcResidents: number; claimedChunks: number; checkedAt: string } | null
>;
function useTownStats() {
  const [stats, setStats] = useState<TownStats>({});
  useEffect(
    () =>
      PREVIEW_MODE
        ? undefined
        : watchResource<TownStats>("/api/towns/stats", setStats, () => {}),
    [],
  );
  return stats;
}
const applyStats = (town: Town, stats: TownStats): Town =>
  town.testData || town.id === "test-town" || PREVIEW_MODE
    ? town
    : {
        ...town,
        earthmcResidents: stats[town.id]?.earthmcResidents ?? null,
        claimedChunks: stats[town.id]?.claimedChunks ?? null,
      };
export function useTowns() {
  const stats = useTownStats();
  const [towns, setTowns] = useState<Town[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (PREVIEW_MODE) {
      setTowns(
        sampleTowns.map((town) => ({ ...town, mayorUid: previewAccount.uid })),
      );
      setLoading(false);
      return;
    }
    return watchResource<Town[]>(
      "/api/towns",
      (items) => {
        setTowns(items);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setTowns([]);
        setError(reason.message);
        setLoading(false);
      },
    );
  }, []);
  return {
    towns: towns.map((town) => applyStats(town, stats)),
    loading,
    error,
  };
}
export function useTown(id: string, revision = 0) {
  const stats = useTownStats();
  const [town, setTown] = useState<Town | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setLoading(true);
    setTown(null);
    setError("");
    if (PREVIEW_MODE) {
      const sample = sampleTowns.find((town) => town.id === id);
      setTown(sample ? { ...sample, mayorUid: previewAccount.uid } : null);
      setLoading(false);
      return;
    }
    return watchResource<Town>(
      "/api/towns/" + encodeURIComponent(id),
      (value) => {
        setTown(value);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [id, revision]);
  return { town: town ? applyStats(town, stats) : null, loading, error };
}
export const seedCloudTown = () =>
  apiRequest("/api/admin/test-town", { method: "POST", body: {} });

export const townTypes = {
  capital: "Capital",
  settlement: "Settlement",
  village: "Village",
  small_town: "Small Town",
  major_town: "Major Town",
  city: "City",
} as const;
export const townTypeLabel = (type?: string) =>
  type && type in townTypes
    ? townTypes[type as keyof typeof townTypes]
    : "Not specified";
