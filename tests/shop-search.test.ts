import { expect, it } from "vitest";
import { townSpawnCommand, bulkMailCommand } from "../src/lib/shop-search";
import { boardSliderPosition } from "../src/components/BoardPageSlider";
it("copies the requested Minecraft commands", () => {
  expect(townSpawnCommand("Isthmia")).toBe("/t spawn Isthmia");
  expect(
    bulkMailCommand({
      username: "Seller",
      items: ["Double chest of stone", "64x Spruce Logs"],
    }),
  ).toBe(
    "/mail Seller I am interested on your posting (Double chest of stone, 64x Spruce Logs) on The Records Project, Bulk selling page, Mail me back or chat with me if you are interested",
  );
  expect(townSpawnCommand("Town\nnext")).toBe("/t spawn Town next");
});
it("positions a two-page slider without changing the Task Board mapping", () => {
  expect(boardSliderPosition(75, 0, 300, 2)).toBe(0);
  expect(boardSliderPosition(225, 0, 300, 2)).toBe(1);
  expect(boardSliderPosition(999, 0, 300, 2)).toBe(1);
  expect(boardSliderPosition(250, 0, 300)).toBe(2);
});
