import type { Role } from "./access";
import { roleNames } from "./access";
export type Citizen = {
  uid: string;
  username: string;
  roles: Role[];
  joinedAt: string | null;
  towns: { id: string; name: string; mayor: boolean }[];
};
export function filterCitizens(
  citizens: Citizen[],
  search: string,
  role: Role | "all",
) {
  const query = search.trim().toLowerCase();
  return citizens.filter(
    (citizen) =>
      (role === "all" || citizen.roles.includes(role)) &&
      (!query ||
        [
          citizen.username,
          ...citizen.towns.map((town) => town.name),
          ...citizen.roles.map((role) => roleNames[role]),
        ].some((value) => value?.toLowerCase().includes(query))),
  );
}
