import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account } from "../src/lib/cloud-auth";
const state = vi.hoisted(() => ({ account: null as Account | null }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({ account: state.account, retry: () => {} }),
}));
vi.mock("../src/components/MicrosoftVerification", () => ({
  default: ({ mode }: { mode: string }) => (
    <button>
      {mode === "link" ? "Link Microsoft account" : "Microsoft verification"}
    </button>
  ),
}));
import { RegistrationProfile } from "../src/pages/Registration";
beforeEach(() => {
  state.account = {
    uid: "private-account-id",
    username: "Player",
    role: "member",
    roles: ["citizen", "mayor"],
    status: "approved",
    createdAt: "2026-10-01T00:00:00Z",
  };
});
it("existing approved users get their profile and an explicit Microsoft link option", () => {
  const html = renderToStaticMarkup(<RegistrationProfile go={() => {}} />);
  expect(html).toContain("Your profile summary");
  expect(html).toContain("Player 3D Minecraft character");
  expect(html).toContain("Connected accounts");
  expect(html).toContain("Link Microsoft account");
  expect(html).toContain("View public profile");
  expect(html).not.toContain("private-account-id");
  expect(html).not.toContain("Registration pending");
});
it("verified users see their linked state instead of a second linking action", () => {
  state.account = { ...state.account!, minecraftVerified: true };
  const html = renderToStaticMarkup(<RegistrationProfile />);
  expect(html).toContain("Microsoft linked");
  expect(html).toContain("Verified through Microsoft");
  expect(html).not.toContain("Link Microsoft account");
});
it("pending manual registrations keep the review screen instead of the approved profile", () => {
  state.account = {
    ...state.account!,
    status: "pending",
    registrationMethod: "manual-emc",
  };
  const html = renderToStaticMarkup(<RegistrationProfile go={() => {}} />);
  expect(html).toContain("Registration pending");
  expect(html).toContain("Awaiting approval");
  expect(html).not.toContain("Your profile summary");
  expect(html).not.toContain("Link Microsoft account");
});
it("signed-out viewers do not render private profile controls", () => {
  state.account = null;
  expect(renderToStaticMarkup(<RegistrationProfile />)).toBe("");
});
