export type Availability = {
  id: string;
  ownerUid: string;
  username: string;
  title: string;
  description: string;
  minGold: number;
  maxGold: number;
  period: "daily" | "weekly" | "monthly";
  active: boolean;
  version: number;
  updatedAt: string;
};
export type HiringInbox = {
  id: string;
  otherUid: string;
  otherName: string;
  listingTitle: string;
  lastMessage: string;
  lastSeq: number;
  readSeq: number;
  updatedAt: string;
};
export type HiringMessage = {
  id: string;
  seq: number;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt: string;
};
export type HiringConversation = {
  thread: {
    id: string;
    workerUid: string;
    workerName: string;
    employerUid: string;
    employerName: string;
    listingTitle: string;
    minGold: number;
    maxGold: number;
    period: Availability["period"];
    lastSeq: number;
  };
  messages: HiringMessage[];
  hasEarlier: boolean;
};
export const payPeriods = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
export const payRange = (
  item: Pick<Availability, "minGold" | "maxGold" | "period">,
) =>
  `${item.minGold.toLocaleString()} - ${item.maxGold.toLocaleString()} Gold / ${item.period === "daily" ? "day" : item.period === "weekly" ? "week" : "month"}`;
