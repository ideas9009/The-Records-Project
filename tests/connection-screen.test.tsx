import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ConnectionScreen from "../src/components/ConnectionScreen";
import {
  connectionStage,
  setConnectionStage,
  subscribeConnection,
} from "../src/lib/connection-progress";
it("shows the custom loading circle and a tip without visible connection text or progress", () => {
  const html = renderToStaticMarkup(<ConnectionScreen stage="reading" />);
  expect(html).toContain("connection-loader");
  expect(html).toContain("Helpful tip");
  expect(html).not.toContain("Connecting…");
  expect(html).not.toContain("Reading your account details…");
  expect(html).not.toContain("Waiting for the sign-in service");
  expect(html).not.toContain('role="progressbar"');
  expect(html).not.toContain('class="card');
  expect(html).not.toContain("The Records Project");
});
it("shows a retry action instead of loading progress on failure", () => {
  const html = renderToStaticMarkup(
    <ConnectionScreen
      error="The server could not be reached."
      onRetry={() => {}}
    />,
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("Retry connection");
  expect(html).not.toContain('role="progressbar"');
  expect(html).not.toContain('class="loading-spinner"');
});
it("publishes actual stage changes and unsubscribes cleanly", () => {
  setConnectionStage("session");
  const listener = vi.fn();
  const stop = subscribeConnection(listener);
  setConnectionStage("waiting");
  expect(connectionStage()).toBe("waiting");
  expect(listener).toHaveBeenCalledTimes(1);
  setConnectionStage("waiting");
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  setConnectionStage("session");
  expect(listener).toHaveBeenCalledTimes(1);
});
