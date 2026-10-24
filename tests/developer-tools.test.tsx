import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account } from "../src/lib/cloud-auth";
const auth = vi.hoisted(() => ({ account: null as Account | null }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({ account: auth.account, retry: () => {} }),
}));
import {
  canUseDeveloperTools,
  DEVELOPER_ACCOUNT_UID,
  developerScreens,
} from "../src/lib/developer-tools";
import DeveloperTools, {
  DeveloperScreenPreview,
} from "../src/pages/DeveloperTools";
const owner: Account = {
  uid: DEVELOPER_ACCOUNT_UID,
  username: "Sumeitideas",
  role: "operator",
  status: "approved",
  createdAt: "",
};
it("gates by the exact approved account ID, never name or elevated role", () => {
  expect(canUseDeveloperTools(owner)).toBe(true);
  expect(canUseDeveloperTools({ ...owner, username: "RenamedPlayer" })).toBe(
    true,
  );
  expect(canUseDeveloperTools({ ...owner, uid: "another-operator" })).toBe(
    false,
  );
  expect(canUseDeveloperTools({ ...owner, status: "pending" })).toBe(false);
  expect(canUseDeveloperTools(null)).toBe(false);
});
it("renders no tools for other users, including operators with the same username", () => {
  auth.account = { ...owner, uid: "not-the-owner" };
  expect(renderToStaticMarkup(<DeveloperTools />)).toBe("");
  auth.account = owner;
  const html = renderToStaticMarkup(<DeveloperTools go={() => {}} />);
  expect(html).toContain("Screen previews");
  expect(html).toContain("Open a specific record");
});
it("renders every preview without requiring a real registration or session change", () => {
  for (const [screen] of developerScreens) {
    const html = renderToStaticMarkup(
      <DeveloperScreenPreview screen={screen} onScreen={() => {}} />,
    );
    expect(html.length).toBeGreaterThan(100);
    expect(html).not.toContain(DEVELOPER_ACCOUNT_UID);
  }
});
it("shows distinct mayor, waiting-citizen and completed states", () => {
  const render = (screen: "register-mayor" | "register-waiting" | "complete") =>
    renderToStaticMarkup(
      <DeveloperScreenPreview screen={screen} onScreen={() => {}} />,
    );
  expect(render("register-mayor")).toContain("link you as its mayor");
  expect(render("register-waiting")).toContain(
    "You cannot be accepted before then",
  );
  const complete = render("complete");
  expect(complete).toContain("Registration complete");
  expect(complete).toContain("Full access enabled");
  expect(complete).not.toContain("Link Microsoft account");
});
