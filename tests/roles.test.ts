import { describe, it, expect } from "vitest";
import {
  canReview,
  canManageRoles,
  canRegisterTown,
  canPublishNews,
  accountRoles,
  type Account,
  type Role,
} from "../src/lib/access";
const account = (
  roles: Role[],
  status: Account["status"] = "approved",
): Account => ({
  username: "User",
  role: "member",
  roles,
  status,
  createdAt: "",
});
describe("multiple roles", () => {
  it("combines roles, recognizes Prime Minister and keeps Deputy out of town registration", () => {
    expect(canRegisterTown(account(["deputy"]))).toBe(false);
    expect(canRegisterTown(account(["deputy", "minister"]))).toBe(true);
    expect(canReview(account(["prime_minister"]))).toBe(true);
    expect(canManageRoles(account(["prime_minister"]))).toBe(true);
    expect(canPublishNews(account(["deputy"]))).toBe(true);
  });
  it("does not turn pending roles into active privileges", () => {
    expect(canReview(account(["operator"], "pending"))).toBe(false);
    expect(canRegisterTown(account(["minister"], "pending"))).toBe(false);
  });
  it("preserves legacy roles and labels old members as Citizens", () => {
    const old = account([]);
    expect(accountRoles(old)).toEqual(["citizen"]);
    expect(canReview({ ...old, role: "operator" })).toBe(true);
  });
});

it("Army has Citizen-level access without administrative or publishing privileges", () => {
  const army = account(["army"]);
  expect(canReview(army)).toBe(false);
  expect(canManageRoles(army)).toBe(false);
  expect(canRegisterTown(army)).toBe(false);
  expect(canPublishNews(army)).toBe(false);
});
