import { expect, it, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({ apiRequest: vi.fn(), setSession: vi.fn() }));
vi.mock("../src/lib/api", () => mock);
import {
  lookupRegistration,
  submitManualRegistration,
} from "../src/lib/manual-registration";
beforeEach(() => {
  mock.apiRequest.mockReset();
  mock.setSession.mockReset();
});
it("looks up only the username before asking for a password", async () => {
  mock.apiRequest.mockResolvedValue({
    receipt: "server-issued",
    profile: { username: "Mayor" },
  });
  await lookupRegistration("Mayor");
  expect(mock.apiRequest).toHaveBeenCalledWith("/api/auth/register/lookup", {
    method: "POST",
    body: { username: "Mayor" },
  });
});
it("submits the server receipt and canonical username without client-selected roles or town", async () => {
  mock.apiRequest.mockResolvedValue({ token: "session" });
  const confirmation = {
    receipt: "proof",
    expiresAt: 100,
    profile: {
      username: "Mayor",
      roles: ["operator"],
      town: { name: "Forged" },
    },
  };
  await submitManualRegistration(confirmation as any, "example-password");
  expect(mock.apiRequest).toHaveBeenCalledWith("/api/auth/register", {
    method: "POST",
    body: {
      username: "Mayor",
      receipt: "proof",
      confirmed: true,
      password: "example-password",
    },
  });
  expect(mock.setSession).toHaveBeenCalledWith("session");
});
it("does not sign in when registration fails", async () => {
  mock.apiRequest.mockRejectedValue(Error("Expired"));
  await expect(
    submitManualRegistration(
      { receipt: "old", profile: { username: "Mayor" } } as any,
      "example-password",
    ),
  ).rejects.toThrow("Expired");
  expect(mock.setSession).not.toHaveBeenCalled();
});
