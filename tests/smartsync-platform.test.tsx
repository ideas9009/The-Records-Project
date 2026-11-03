import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({
  desktop: false,
  role: "citizen",
  status: "approved",
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => state.desktop }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    account: { uid: "person", role: state.role, status: state.status },
  }),
}));
import SmartSync from "../src/components/SmartSync";
import { smartSyncAvailable } from "../src/lib/platform-access";
it("web members see an app-only message without a bypass", () => {
  state.desktop = false;
  state.role = "citizen";
  state.status = "approved";
  const html = renderToStaticMarkup(<SmartSync />);
  expect(html).toContain("only available in the desktop app");
  expect(html).not.toContain("Open SmartSync");
  expect(smartSyncAvailable(state)).toBe(false);
});
it("only an approved Operator gets the website open button", () => {
  state.desktop = false;
  state.role = "operator";
  const html = renderToStaticMarkup(<SmartSync />);
  expect(html).toContain("Open SmartSync");
  expect(smartSyncAvailable(state)).toBe(true);
  for (const role of ["leader", "admin", "prime_minister"]) {
    state.role = role;
    expect(renderToStaticMarkup(<SmartSync />)).not.toContain("Open SmartSync");
  }
  state.role = "operator";
  state.status = "pending";
  expect(renderToStaticMarkup(<SmartSync />)).not.toContain("Open SmartSync");
  state.status = "approved";
});
it("desktop members retain full SmartSync settings", () => {
  state.desktop = true;
  state.role = "citizen";
  const html = renderToStaticMarkup(<SmartSync />);
  expect(html).not.toContain("only available in the desktop app");
  expect(html).toContain("SmartSync");
  expect(smartSyncAvailable(state)).toBe(true);
});
