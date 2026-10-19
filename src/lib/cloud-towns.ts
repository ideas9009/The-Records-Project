import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "./api";
import { PREVIEW_MODE, previewAccount } from "./runtime-mode";
import sampleTowns from "../data/towns.json";
export type Town = (typeof sampleTowns)[number] & {
  mayorUid: string;
  mayorUids?: string[];
  mayorNames?: string[];
  type?: string;
  version?: number;
};
export function useTowns() {
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
  return { towns, loading, error };
}
export function useTown(id: string, revision = 0) {
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
  return { town, loading, error };
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
