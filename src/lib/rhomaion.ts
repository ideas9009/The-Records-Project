import type { AiNavigation } from "./ai-actions";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { canUseDeveloperTools } from "./developer-tools";
import type { Account } from "./cloud-auth";
export const RHOMAION_NAME = "Rhōmaíōn AI";
export type AiPreferences = {
  saveHistory: boolean;
  shareContext: boolean;
  style: "concise" | "detailed";
  keepOnTop: boolean;
};
export const defaultAiPreferences: AiPreferences = {
  saveHistory: true,
  shareContext: true,
  style: "concise",
  keepOnTop: false,
};
export function rhomaionAvailable(account: Account | null | undefined) {
  return (
    !!account &&
    account.status === "approved" &&
    (isTauri() || canUseDeveloperTools(account))
  );
}
export function aiPreferences(uid: string): AiPreferences {
  try {
    const p = JSON.parse(
      localStorage.getItem("records-rhomaion-preferences:" + uid) || "{}",
    );
    return {
      saveHistory: p.saveHistory !== false,
      shareContext: p.shareContext !== false,
      style: p.style === "detailed" ? "detailed" : "concise",
      keepOnTop: p.keepOnTop === true,
    };
  } catch {
    return { ...defaultAiPreferences };
  }
}
export function saveAiPreferences(uid: string, p: AiPreferences) {
  localStorage.setItem(
    "records-rhomaion-preferences:" + uid,
    JSON.stringify(p),
  );
  window.dispatchEvent(new Event("records-ai-preferences"));
}
export function openRhomaion(uid: string) {
  return invoke<void>("rhomaion_open", {
    keepOnTop: aiPreferences(uid).keepOnTop,
  });
}
export type AiProposal = {
  id: string;
  kind: string;
  title: string;
  changes: { field: string; before: string; after: string }[];
  expiresAt: number;
  result?: "approved" | "declined" | "expired" | "failed";
};
export type AiPreview = {unavailable?: boolean; kind: 'player'|'town'|'nation'; uuid: string; name: string; checkedAt: string; record: Record<string, any>};
export type AiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  previews?: AiPreview[];
  proposals?: AiProposal[];
  activity?: { tool: string; ok: boolean }[];
};
export type AiChat = {
  id: string;
  uid: string;
  title: string;
  updatedAt: number;
  messages: AiMessage[];
};
export type AiReply = {
  previews?: AiPreview[];
  text: string;
  navigation: AiNavigation[];
  proposals: AiProposal[];
  activity: { tool: string; ok: boolean }[];
  model: string;
};
export type AiStatus = {
  provider?: "gemini" | "openrouter";
  configured: boolean;
  model: string;
  effectiveRoles: string[];
  editsRequireApproval: boolean;
};
