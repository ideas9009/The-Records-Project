import { it, expect } from "vitest";
import { filterCitizens, type Citizen } from "../src/lib/citizens";
import { canAccessPage } from "../src/lib/access";
const citizens: Citizen[] = [
  {
    uid: "a",
    username: "Sumeitideas",
    roles: ["operator", "minister", "mayor"],
    joinedAt: null,
    towns: [{ id: "capital", name: "Capital", mayor: true }],
  },
  {
    uid: "b",
    username: "Visitor",
    roles: ["citizen"],
    joinedAt: null,
    towns: [],
  },
];
it("searches usernames, town names and role names without case sensitivity", () => {
  for (const query of [" SUMEIT ", "capital", "Operator", "minister"])
    expect(
      filterCitizens(citizens, query, "all").map((user) => user.uid),
    ).toEqual(["a"]);
  expect(filterCitizens(citizens, "no match", "all")).toEqual([]);
});
it("role filters include every role of multi-role accounts and combine with search", () => {
  expect(filterCitizens(citizens, "", "mayor").map((user) => user.uid)).toEqual(
    ["a"],
  );
  expect(filterCitizens(citizens, "Visitor", "mayor")).toEqual([]);
  expect(
    filterCitizens(citizens, "", "citizen").map((user) => user.uid),
  ).toEqual(["b"]);
  expect(filterCitizens(citizens, "", "all")).toEqual(citizens);
});
it("pending applicants can browse citizen profiles while town details stay restricted", () => {
  const pending = {
    username: "Applicant",
    role: "member" as const,
    status: "pending" as const,
    createdAt: "",
  };
  expect(canAccessPage(pending, "citizens")).toBe(true);
  expect(canAccessPage(pending, "citizen:a")).toBe(true);
  expect(canAccessPage(pending, "town:capital")).toBe(false);
  expect(canAccessPage(null, "citizen:a")).toBe(false);
});
