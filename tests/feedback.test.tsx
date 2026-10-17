import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  beginRequest,
  requestCount,
  subscribeRequests,
} from "../src/lib/request-activity";
import { LoadingStatus } from "../src/components/Loading";
import { confirmationPosition } from "../src/components/ExpandingConfirmation";
it("tracks simultaneous requests and only clears after every request finishes", () => {
  const counts: number[] = [];
  const stop = subscribeRequests(() => counts.push(requestCount()));
  const finishFirst = beginRequest(),
    finishSecond = beginRequest();
  expect(requestCount()).toBe(2);
  finishFirst();
  expect(requestCount()).toBe(1);
  finishFirst();
  expect(requestCount()).toBe(1);
  finishSecond();
  expect(requestCount()).toBe(0);
  stop();
  expect(counts).toEqual([1, 2, 1, 0]);
});
it("places confirmation at the triggering button and keeps edge buttons on screen", () => {
  expect(
    confirmationPosition(
      { left: 165, top: 50 },
      { width: 420, height: 230 },
      { width: 1200, height: 900 },
    ),
  ).toEqual({ left: 165, top: 50 });
  expect(
    confirmationPosition(
      { left: 1080, top: 850 },
      { width: 420, height: 230 },
      { width: 1200, height: 900 },
    ),
  ).toEqual({ left: 768, top: 658 });
  expect(
    confirmationPosition(
      { left: -50, top: -20 },
      { width: 420, height: 230 },
      { width: 1200, height: 900 },
    ),
  ).toEqual({ left: 12, top: 12 });
});
it("shows an accessible loading message alongside its decorative spinner", () => {
  const html = renderToStaticMarkup(
    <LoadingStatus>Loading news…</LoadingStatus>,
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("loading-spinner");
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("Loading news…");
});
