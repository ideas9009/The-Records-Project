import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ status: "approved" }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    account: { uid: "member", username: "Player", status: state.status },
  }),
}));
import Companies from "../src/pages/Companies";
it("offers a request button in the titlebar without building company registration forms", () => {
  state.status = "approved";
  const html = renderToStaticMarkup(<Companies />);
  expect(html).toContain("page-banner");
  expect(html).toContain("Register your company");
  expect(html).toContain("Coming soon in future updates");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("disabled=");
});
it("requires approved registration before sending a company request", () => {
  state.status = "pending";
  const html = renderToStaticMarkup(<Companies />);
  expect(html).toContain("disabled=");
  expect(html).toContain("must be approved");
  state.status = "approved";
});
