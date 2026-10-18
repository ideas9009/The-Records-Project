import { apiRequest, setSession } from "./api";
export type MicrosoftMode = "login" | "register" | "link";
export type MicrosoftFlow = {
  id: string;
  secret: string;
  url: string;
  expiresAt: number;
};
export type MicrosoftProfile = {
  username: string;
  avatar: string | null;
  balance: number | null;
  townBalance: number | null;
  isMayor: boolean;
  town: { name: string; uuid: string };
  nation: { name: string };
  ranks: string[];
  townRegistered: boolean;
};
export type MicrosoftReady = {
  status: "ready";
  mode: MicrosoftMode;
  confirmationDigest: string;
  profile: MicrosoftProfile;
};
export type MicrosoftPoll =
  | MicrosoftReady
  | { status: "waiting" | "processing" | "failed"; error?: string };
export const microsoftConfig = () =>
  apiRequest<{ enabled: boolean }>("/api/auth/microsoft/config");
export const startMicrosoft = (mode: MicrosoftMode) =>
  apiRequest<MicrosoftFlow>("/api/auth/microsoft/start", {
    method: "POST",
    body: { mode },
  });
export const pollMicrosoft = (flow: MicrosoftFlow) =>
  apiRequest<MicrosoftPoll>("/api/auth/microsoft/poll", {
    method: "POST",
    body: { id: flow.id, secret: flow.secret },
  });
export const cancelMicrosoft = (flow: MicrosoftFlow) =>
  apiRequest("/api/auth/microsoft/cancel", {
    method: "POST",
    body: { id: flow.id, secret: flow.secret },
  });
export async function finishMicrosoft(
  flow: MicrosoftFlow,
  digest: string,
  password?: string,
) {
  const result = await apiRequest<{
    token?: string;
    confirmationChanged?: boolean;
  }>("/api/auth/microsoft/finish", {
    method: "POST",
    body: {
      id: flow.id,
      secret: flow.secret,
      confirmationDigest: digest,
      ...(password ? { password } : {}),
    },
  });
  if (result.token) setSession(result.token);
  return result;
}
export function microsoftAuthorizationUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.origin !== "https://login.microsoftonline.com" ||
    url.pathname !== "/consumers/oauth2/v2.0/authorize" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw Error("Invalid Microsoft sign-in address.");
  return url.href;
}
export const goldBalance = (value: number | null) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString() + " Gold"
    : "Unavailable";
