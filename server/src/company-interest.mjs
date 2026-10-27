import { ApiError, approved } from "./security.mjs";
export const COMPANY_CONTACT_UID = "cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67";
export function createCompanyInterest(store, { now = Date.now } = {}) {
  const valid = (profile) => {
    if (
      !profile ||
      profile.authType !== "records" ||
      profile.nation !== "byzantium" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(profile.uid || "")
    )
      throw new ApiError(403, "Please sign in with your TRP account.");
    approved(profile);
  };
  async function requestCompanyRegistration(profile) {
    valid(profile);
    return store.transaction(async (tx) => {
      const requester = await tx.get("users/" + profile.uid);
      valid(requester);
      const recipient = await tx.get("users/" + COMPANY_CONTACT_UID);
      if (
        !recipient ||
        recipient.status !== "approved" ||
        recipient.authType !== "records" ||
        recipient.nation !== "byzantium"
      )
        throw new ApiError(
          503,
          "Company registration requests are temporarily unavailable. Please try again later.",
        );
      const path =
        "users/" +
        COMPANY_CONTACT_UID +
        "/notifications/company-registration-" +
        profile.uid;
      const existing = await tx.get(path);
      if (existing) return { sent: true, alreadySent: true };
      const stamp = new Date(now()).toISOString();
      tx.set(path, {
        type: "company-registration",
        title: "Company registration request",
        message: requester.username + " would like to register a company.",
        requesterUid: requester.uid,
        requesterUsername: requester.username,
        createdAt: stamp,
        updatedAt: stamp,
      });
      return { sent: true, alreadySent: false };
    });
  }
  async function notifications(profile) {
    valid(profile);
    const path = "users/" + profile.uid + "/notifications";
    const rows = await (store.inboxRows
      ? store.inboxRows(path)
      : store.list(path, null, 100));
    return rows
      .filter((row) => row.type === "company-registration")
      .map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return { requestCompanyRegistration, notifications };
}
