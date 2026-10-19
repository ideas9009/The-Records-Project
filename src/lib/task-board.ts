export type Material = { quantity: number; name: string };
export type BoardKind = "task" | "materials";
export type BoardStatus =
  | "open"
  | "assigned"
  | "submitted"
  | "awaiting_payment"
  | "completed"
  | "cancelled";
export const boardStatus: Record<BoardStatus, string> = {
  open: "Open",
  assigned: "In progress",
  submitted: "Awaiting review",
  awaiting_payment: "Awaiting payment",
  completed: "Completed",
  cancelled: "Cancelled",
};
export type BoardListing = {
  id: string;
  kind: BoardKind;
  title: string;
  description: string;
  materials: Material[];
  priceGold: number;
  agreedGold: number | null;
  deadline: string | null;
  approvalRequired: boolean;
  ownerUid: string;
  ownerName: string;
  assigneeUid: string | null;
  assigneeName: string | null;
  status: BoardStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewNote: string;
};
export type BoardOffer = {
  uid: string;
  username: string;
  priceGold: number;
  message: string;
  lastBy: string;
  version: number;
  status: "pending" | "accepted" | "declined";
  updatedAt: string;
};
export type BoardDetail = BoardListing & {
  applications: {
    uid: string;
    username: string;
    message: string;
    createdAt: string;
  }[];
  offers: BoardOffer[];
  proof: {
    image: string;
    message: string;
    submittedName: string;
    submittedAt: string;
  } | null;
};
export function parseMaterials(value: string): Material[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 50)
    throw Error("Add between 1 and 50 material lines.");
  return lines.map((line) => {
    const match = /^(\d+)\s*[xX\u00d7]\s*(.+)$/.exec(line);
    if (
      !match ||
      Number(match[1]) < 1 ||
      Number(match[1]) > 1000000 ||
      match[2].trim().length > 80
    )
      throw Error(
        "Use a quantity and material on each line, such as 64x Spruce Logs.",
      );
    return { quantity: Number(match[1]), name: match[2].trim() };
  });
}
export const goldLabel = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " Gold";
export const isArchived = (listing: BoardListing) =>
  ["completed", "cancelled"].includes(listing.status);
