import type { AiNavigation } from "./ai-actions";
import { apiRequest } from "./api";
import type { AiReply, AiPreview } from "./rhomaion";
type Progress = { phase: string; tool?: string; round?: number; previews?: AiPreview[]; navigation?: AiNavigation[] };
const toolNames: Record<string, string> = { open_earthmc: "Looking up the EarthMC profile", prepare_draft: "Preparing your draft", search_records: "Searching records", show_expansion_route: "Planning the expansion route", get_app_guide: "Checking the app guide", open_town: "Opening the town", list_towns: "Finding towns", get_town: "Reading town information", get_current_user: "Checking permissions", lookup_earthmc: "Checking EarthMC", analyse_expansion: "Surveying nearby chunks", open_page: "Opening the page", propose_town_edit: "Preparing changes for approval" };
function progressText(p?: Progress) {
  if (p?.phase === "tool" && p.tool) return (toolNames[p.tool] || "Checking information") + "…";
  if (p?.phase === "tool_complete") return "Action completed. Waiting for Rhōmaíōn’s explanation…";
  if (p?.phase === "response") return "Receiving Rhōmaíōn’s reply…";
  if (p?.round && p.round > 1) return "Waiting for Rhōmaíōn’s follow-up (step " + p.round + ")…";
  return "Waiting for Rhōmaíōn…";
}
export async function requestAiReply(
  body: unknown,
  active: () => boolean,
  progress: (message: string) => void,
  navigate?: (action: AiNavigation) => Promise<void>,
  preview?: (item: AiPreview) => void,
): Promise<AiReply> {
  const { requestId } = await apiRequest<{ requestId: string }>("/api/ai/requests", { method: "POST", body });
  const deadline = Date.now() + 210000;
  let version = -1, seenNavigation = 0, seenPreviews = 0;
  progress("Waiting for Rhōmaíōn…");
  while (active() && Date.now() < deadline) {
    const result = await apiRequest<{ state: "pending" | "complete"; reply?: AiReply; progress?: Progress; version?: number }>(
      "/api/ai/requests/" + encodeURIComponent(requestId) + "?after=" + version, { networkOnly: true },
    );
    if (!active()) throw Error("The AI window was closed.");
    const previews = result.reply?.previews || result.progress?.previews || [];
    while (preview && seenPreviews < previews.length) preview(previews[seenPreviews++]);
    const actions = result.reply?.navigation || result.progress?.navigation || [];
    while (navigate && seenNavigation < actions.length) {
      await navigate(actions[seenNavigation++]);
    }
    if (result.state === "complete" && result.reply) return result.reply;
    if (result.state !== "pending") throw Error("The server returned an invalid AI response.");
    version = result.version ?? version;
    progress(result.progress ? progressText(result.progress) : "Rhōmaíōn is still preparing a reply…");
  }
  throw Error(active() ? "Rhōmaíōn did not finish in time. Please try again later." : "The AI window was closed.");
}
