export type EarthMcPlot = {
  world: string;
  x: number;
  z: number;
  home: boolean;
};
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function townPlots(town: Record<string, unknown>): EarthMcPlot[] {
  const coordinates = record(town.coordinates);
  const home = coordinates.homeBlock;
  const result: EarthMcPlot[] = [];
  const seen = new Set<string>();
  const add = (world: string, items: unknown, isMain: boolean) => {
    if (!Array.isArray(items)) return;
    for (const pair of items) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !pair.every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 1875000)
      )
        continue;
      const [x, z] = pair as number[],
        key = world + ":" + x + ":" + z;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        world,
        x,
        z,
        home: isMain && Array.isArray(home) && home[0] === x && home[1] === z,
      });
    }
  };
  add(
    typeof record(coordinates.spawn).world === "string"
      ? (record(coordinates.spawn).world as string)
      : "earth",
    coordinates.townBlocks,
    true,
  );
  for (const [world, value] of Object.entries(record(coordinates.worlds))) {
    const data = record(value);
    add(world, data.townblocks ?? data.townBlocks, false);
  }
  return result.sort(
    (a, b) => a.world.localeCompare(b.world) || a.x - b.x || a.z - b.z,
  );
}
export const plotBounds = (plot: EarthMcPlot) => ({
  minX: plot.x * 16,
  maxX: plot.x * 16 + 15,
  minZ: plot.z * 16,
  maxZ: plot.z * 16 + 15,
});
export function quarterReferences(
  value: unknown,
): { name: string; uuid: string }[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, { name: string; uuid: string }>();
  for (const item of value) {
    const data = record(item),
      uuid = typeof item === "string" ? item : data.uuid;
    if (
      typeof uuid !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      )
    )
      continue;
    const known = unique.get(uuid.toLowerCase());
    unique.set(uuid.toLowerCase(), {
      uuid: uuid.toLowerCase(),
      name: typeof data.name === "string" && data.name.trim() ? data.name : known?.name || "Unnamed apartment",
    });
  }
  return [...unique.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}
