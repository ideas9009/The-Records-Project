import { it, expect } from "vitest";
import {
  expansionBudget,
  connectedClaimSelection,
} from "../src/lib/town-suggestions";
it("charges each acquired chunk once and preserves a bank reserve", () => {
  expect(expansionBudget(5, 3, 100, 20)).toEqual({
    total: 128,
    deposit: 48,
    after: -28,
  });
  expect(expansionBudget(2, 0, 100, 20)).toEqual({
    total: 32,
    deposit: 0,
    after: 68,
  });
});
it("does not invent unknown bank balances or accept invalid chunk counts", () => {
  expect(expansionBudget(2, 0, null, 0)).toEqual({
    total: 32,
    deposit: null,
    after: null,
  });
  expect(expansionBudget(NaN, -2, 100, 0).total).toBe(0);
  expect(expansionBudget(1.9, 0, 100, 0).total).toBe(16);
});

it("selected expansion routes stay connected when adding distant cells or removing a bridge", () => {
  expect(connectedClaimSelection([[0, 0]], ["1,0", "2,0", "3,0"])).toEqual([
    "1,0",
    "2,0",
    "3,0",
  ]);
  expect(connectedClaimSelection([[0, 0]], ["1,0", "3,0"])).toEqual(["1,0"]);
  expect(connectedClaimSelection([[0, 0]], ["1,1"])).toEqual([]);
});
