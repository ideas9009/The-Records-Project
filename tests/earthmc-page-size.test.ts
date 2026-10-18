import { it, expect } from "vitest";
import {
  readEarthMcPageSize,
  rememberEarthMcPageSize,
  earthMcPageSizes,
} from "../src/lib/earthmc-page-size";
it("restores supported sizes and resets invalid or legacy Full settings to 20", () => {
  for (const size of earthMcPageSizes)
    expect(readEarthMcPageSize({ getItem: () => String(size) })).toBe(size);
  for (const value of [null, "full", "60", "0", "invalid"])
    expect(readEarthMcPageSize({ getItem: () => value })).toBe(20);
});
it("records the safe fallback before Full can be rendered and survives unavailable storage", () => {
  let saved = "1000";
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  rememberEarthMcPageSize(storage, "full");
  expect(saved).toBe("20");
  expect(readEarthMcPageSize(storage)).toBe(20);
  rememberEarthMcPageSize(storage, 75);
  expect(readEarthMcPageSize(storage)).toBe(75);
  expect(() =>
    rememberEarthMcPageSize(
      {
        setItem: () => {
          throw Error();
        },
      },
      "full",
    ),
  ).not.toThrow();
  expect(
    readEarthMcPageSize({
      getItem: () => {
        throw Error();
      },
    }),
  ).toBe(20);
});
