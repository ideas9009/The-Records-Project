export const roleNames = {
  operator: "Operator",
  leader: "Leader",
  prime_minister: "Prime Minister",
  admin: "Admin",
  minister: "Minister",
  deputy: "Deputy",
  mayor: "Mayor",
  army: "Army",
  citizen: "Citizen",
} as const;
export type Role = keyof typeof roleNames;
export type Account = {
  username: string;
  role: "member" | Role;
  roles?: Role[];
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
};
export const accountRoles = (account: Account): Role[] =>
  account.roles?.length
    ? account.roles
    : [account.role === "member" ? "citizen" : account.role];
export const hasRole = (account: Account | null, roles: Role[]) =>
  !!account &&
  account.status === "approved" &&
  accountRoles(account).some((role) => roles.includes(role));
export const roleLabels = (account: Account) =>
  accountRoles(account)
    .map((role) => roleNames[role])
    .join(" · ");
export const canReview = (account: Account | null) =>
  hasRole(account, ["operator", "admin", "leader", "prime_minister"]);
export const canManageRoles = (account: Account | null) =>
  hasRole(account, ["operator", "leader", "prime_minister"]);
export const canRegisterTown = (account: Account | null) =>
  hasRole(account, [
    "operator",
    "leader",
    "prime_minister",
    "admin",
    "minister",
  ]);
export const canPublishNews = (account: Account | null) =>
  hasRole(account, [
    "operator",
    "admin",
    "leader",
    "prime_minister",
    "minister",
    "deputy",
  ]);
const pendingPages = [
  "home",
  "towns",
  "citizens",
  "shops",
  "companies",
  "settings",
  "map",
  "profile",
  "about",
];
export function canAccessPage(account: Account | null, page: string) {
  if (!account) return false;
  if (page === "admin") return canReview(account);
  if (page.startsWith("citizen:"))
    return account.status === "approved" || account.status === "pending";
  if (
    page === "news:meeting" ||
    page === "news:new" ||
    page.startsWith("news:edit:")
  )
    return canPublishNews(account);
  return account.status === "approved" || pendingPages.includes(page);
}
export function canPerform(
  account: Account | null,
  action:
    | "open-town"
    | "open-shop"
    | "create-shop"
    | "create-order"
    | "upload-town-image",
) {
  return !!account && account.status === "approved";
}
