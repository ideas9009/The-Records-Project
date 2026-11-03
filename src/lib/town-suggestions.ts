export type SuggestionCell = {
  x: number;
  z: number;
  state: "free" | "potential" | "blocked" | "unknown";
  reason: string;
  direction: string;
  owner: string | null;
  distance?: number;
  adjacent?: boolean;
  reachable?: boolean;
};
export type TownSuggestionsData = {
  name: string;
  home: [number, number];
  chunks: [number, number][];
  cells: SuggestionCell[];
  targets: {
    name: string;
    uuid: string;
    surplus: number | null;
    potential: number;
    reason: string;
  }[];
  balance: number | null;
  capacity: number | null;
  scanned: number;
  borderTotal: number;
  checkedAt: string;
  costPerChunk: number;
  scanRadius?: number;
  coverageLimited?: boolean;
};
export function expansionBudget(
  claims: number,
  overclaims: number,
  balance: number | null,
  reserve: number,
) {
  const count = (n: number) =>
    Number.isFinite(n) ? Math.min(10000, Math.max(0, Math.floor(n))) : 0;
  const total = (count(claims) + count(overclaims)) * 16;
  const available =
    balance === null
      ? null
      : Math.max(
          0,
          balance - Math.max(0, Number.isFinite(reserve) ? reserve : 0),
        );
  return {
    total,
    deposit: available === null ? null : Math.max(0, total - available),
    after: balance === null ? null : balance - total,
  };
}

export function connectedClaimSelection(
  owned: [number, number][],
  selected: string[],
) {
  const remaining = new Set(selected),
    queue = owned.map(([x, z]) => x + "," + z),
    connected = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i].split(",").map(Number);
    for (const id of [
      [x, z - 1],
      [x + 1, z],
      [x, z + 1],
      [x - 1, z],
    ].map((p) => p.join(",")))
      if (remaining.delete(id)) {
        connected.add(id);
        queue.push(id);
      }
  }
  return selected.filter((id) => connected.has(id));
}

export function verifiedAiRouteSelection(data:TownSuggestionsData,points:[number,number][]){
 const free=new Set(data.cells.filter(cell=>cell.state==='free').map(cell=>cell.x+','+cell.z));
 const maximum=data.capacity===null?0:Math.max(0,Math.min(24,Math.floor(data.capacity)));
 const requested=[...new Set(points.map(point=>point.join(',')))].filter(key=>free.has(key)).slice(0,maximum);
 return connectedClaimSelection(data.chunks,requested);
}
