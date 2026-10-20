import { apiRequest, setSession } from "./api";
export type ManualProfile = {
  username: string;
  minecraftUuid: string;
  isMayor: boolean;
  isCapital: boolean;
  town: { name: string; uuid: string; mayorName: string; mayorUuid: string };
  nation: { name: string; uuid: string };
  ranks: string[];
  balance: number | null;
  townBalance: number | null;
  townRegistered?: boolean;
  mayorRegistered?: boolean;
};
export type ManualConfirmation = {
  receipt: string;
  expiresAt: number;
  profile: ManualProfile;
};
export const lookupRegistration = (username: string) =>
  apiRequest<ManualConfirmation>("/api/auth/register/lookup", {
    method: "POST",
    body: { username },
  });
export async function submitManualRegistration(
  confirmation: ManualConfirmation,
  password: string,
) {
  const result = await apiRequest<{ token: string }>("/api/auth/register", {
    method: "POST",
    body: {
      username: confirmation.profile.username,
      receipt: confirmation.receipt,
      confirmed: true,
      password,
    },
  });
  setSession(result.token);
}
