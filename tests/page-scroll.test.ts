import { describe, it, expect } from "vitest";
import { surfaceEdges, pinnedOffsets } from "../src/lib/page-scroll";
describe("pinned page chrome and scroll-edge geometry", () => {
  it("stacks wrapped title/search/filter rows without overlapping", () => {
    expect(pinnedOffsets([96, 74, 48])).toEqual([0, 108, 194]);
    expect(pinnedOffsets([144, 108])).toEqual([0, 156]);
  });
  it("leaves fully visible tiles untouched", () => {
    const edges = surfaceEdges(300, 150, 200, 800, true, true);
    expect(edges.active).toBe(false);
    expect(edges.topHeight).toBe(0);
    expect(edges.bottomHeight).toBe(0);
  });
  it("softens only the 28px strip at the top of a tall card", () => {
    const edges = surfaceEdges(100, 1000, 200, 800, true, true);
    expect(edges.top).toBe(100);
    expect(edges.topY).toBe(100);
    expect(edges.topHeight).toBe(28);
    expect(edges.bottomY).toBe(672);
    expect(edges.bottomHeight).toBe(28);
  });
  it("does not fade the first or last row when already at that scroll boundary", () => {
    expect(surfaceEdges(200, 100, 200, 800, false, false).active).toBe(false);
    expect(surfaceEdges(700, 100, 200, 800, false, false).active).toBe(false);
  });
  it("clips blur strips to partially visible small tiles", () => {
    const top = surfaceEdges(215, 20, 200, 800, true, true);
    expect(top.topY).toBe(0);
    expect(top.topHeight).toBe(13);
    const bottom = surfaceEdges(785, 20, 200, 800, true, true);
    expect(bottom.bottomY).toBe(0);
    expect(bottom.bottomHeight).toBe(15);
  });
});
