import { expect, it } from "vitest";
import { boardSliderPosition } from "../src/components/BoardPageSlider";
it("maps pointer positions to the three sections, including scaled control widths", () => {
  for (const width of [300, 420, 756])
    for (let index = 0; index < 3; index++)
      expect(
        boardSliderPosition(100 + (width * (index + 0.5)) / 3, 100, width),
      ).toBeCloseTo(index);
  expect(boardSliderPosition(-30, 100, 420)).toBe(0);
  expect(boardSliderPosition(1000, 100, 420)).toBe(2);
  expect(boardSliderPosition(100, 100, 0)).toBe(0);
});
