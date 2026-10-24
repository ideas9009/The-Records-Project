import type { Account } from "./cloud-auth";
// Account identity is supplied by the authenticated session, never by a name or role.
export const DEVELOPER_ACCOUNT_UID = "cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67";
export function canUseDeveloperTools(account: Account | null | undefined) {
  return (
    account?.uid === DEVELOPER_ACCOUNT_UID && account.status === "approved"
  );
}
export const developerScreens = [
  ["login", "Sign in"],
  ["register-lookup", "Registration: EMC username"],
  ["register-mayor", "Registration: confirm mayor"],
  ["register-citizen", "Registration: confirm citizen"],
  ["register-waiting", "Registration: town or mayor not registered"],
  ["register-password", "Registration: set password"],
  ["pending", "Registration submitted: awaiting review"],
  ["waiting", "Registration submitted: waiting for mayor"],
  ["complete", "Registration complete"],
  ["microsoft", "Microsoft: confirm Minecraft profile"],
  ["loading", "Connecting to TRP"],
  ["connection-error", "Connection failed"],
] as const;
export type DeveloperScreen = (typeof developerScreens)[number][0];
export const developerPages = [
  ["jobs:new:task", "Publish task"],
  ["jobs:new:materials", "Publish material request"],
  ["jobs:availability:edit", "Edit availability"],
  ["jobs:inbox", "Hiring inbox"],
  ["shops:new:shop", "Publish shop"],
  ["shops:new:bulk", "Publish bulk listing"],
  ["news:new", "Publish news"],
  ["news:meeting", "Publish meeting"],
  ["earthmc-people", "People on EarthMC"],
  ["settings:account", "Account settings"],
  ["about", "About"],
  ["changelog", "Changelog"],
] as const;
export const developerDetails = [
  ["town:", "Town"],
  ["citizen:", "Citizen"],
  ["earthmc-player:", "EarthMC player"],
  ["jobs:item:", "Task / material request"],
  ["jobs:hire:", "Hire person"],
  ["jobs:chat:", "Hiring conversation"],
  ["shops:item:", "Shop / bulk listing"],
  ["shops:edit:", "Edit shop / bulk listing"],
  ["news:", "News article"],
  ["news:edit:", "Edit news article"],
  ["changelog:", "Version release notes"],
] as const;
