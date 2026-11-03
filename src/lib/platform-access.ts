import { isTauri } from "@tauri-apps/api/core";
type Identity = { role?: string; roles?: readonly string[]; status?: string };
export const operatorSmartSyncAllowed = (
  account: Identity | null | undefined,
) =>
  account?.status === "approved" &&
  (account.roles?.length
    ? account.roles.includes("operator")
    : account.role === "operator");
export const smartSyncAvailable = (account: Identity | null | undefined) =>
  isTauri() || operatorSmartSyncAllowed(account);
