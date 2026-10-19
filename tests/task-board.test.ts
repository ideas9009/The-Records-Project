import { expect, it } from "vitest";
import {
  parseMaterials,
  isArchived,
  type BoardListing,
} from "../src/lib/task-board";
it("parses material quantities without merging names or accepting malformed lines", () => {
  expect(parseMaterials("64x Spruce Logs\n32x Birch Logs")).toEqual([
    { quantity: 64, name: "Spruce Logs" },
    { quantity: 32, name: "Birch Logs" },
  ]);
  for (const value of [
    "Logs",
    "0x Logs",
    "1.5x Logs",
    "1000001x Logs",
    "",
    Array(51).fill("1x Stone").join("\n"),
  ])
    expect(() => parseMaterials(value)).toThrow();
});
it("only completed and cancelled listings appear in the archive", () => {
  for (const status of [
    "open",
    "assigned",
    "submitted",
    "awaiting_payment",
    "completed",
    "cancelled",
  ])
    expect(isArchived({ status } as BoardListing)).toBe(
      ["completed", "cancelled"].includes(status),
    );
});
