import { beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../src/lib/api", () => ({ apiRequest: mocked.apiRequest }));
beforeEach(() => {
  vi.resetModules();
  mocked.apiRequest.mockReset();
});
it("uses the API target for VoteParty and does not convert missing values to zero", async () => {
  const { votePercent, finiteStat } = await import("../src/lib/overview");
  expect(votePercent(1148, 5000)).toBe(77);
  expect(votePercent(50, 200)).toBe(75);
  expect(votePercent(null, 5000)).toBeNull();
  expect(votePercent(20, 0)).toBeNull();
  expect(votePercent(6000, 5000)).toBe(0);
  expect(finiteStat(null)).toBeNull();
  expect(finiteStat(0)).toBe(0);
});
it("ranks each chart separately and preserves zero balances", async () => {
  const { rankTowns } = await import("../src/lib/overview");
  const towns = [
    { name: "A", population: 20, balance: 0 },
    { name: "B", population: 2, balance: 50 },
    { name: "C", population: null, balance: null },
  ];
  expect(rankTowns(towns, "population").map((t) => t.name)).toEqual(["A", "B"]);
  expect(rankTowns(towns, "balance").map((t) => t.name)).toEqual(["B", "A"]);
  expect(towns.map((t) => t.name)).toEqual(["A", "B", "C"]);
});
it("loads the overview through the authenticated API", async () => {
  const { loadNationOverview } = await import("../src/lib/overview");
  mocked.apiRequest.mockResolvedValue({
    nation: { name: "Byzantium" },
    towns: [],
    chartError: "",
    checkedAt: "2026-10-20T00:00:00Z",
  });
  const data = await loadNationOverview();
  expect(data.nation.name).toBe("Byzantium");
  expect(mocked.apiRequest).toHaveBeenCalledWith("/api/overview", {
    networkOnly: false,
  });
  await loadNationOverview(true);
  expect(mocked.apiRequest).toHaveBeenLastCalledWith("/api/overview", {
    networkOnly: true,
  });
});
