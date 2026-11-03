import { invoke, isTauri } from "@tauri-apps/api/core";
export const widgetDefinitions = [
  {
    kind: "voteparty",
    name: "VoteParty",
    icon: "celebration",
    color: "#d0b8f5",
    description: "Votes remaining until the next EarthMC VoteParty.",
  },
  {
    kind: "balance",
    name: "Nation Balance",
    icon: "paid",
    color: "#ffcf6d",
    description: "Your nation’s current balance on EarthMC.",
  },
  {
    kind: "online",
    name: "Online players",
    icon: "group",
    color: "#8ee0bf",
    description: "Names and Minecraft faces of online players in Byzantium.",
  },
] as const;
export type WidgetKind = (typeof widgetDefinitions)[number]["kind"];
export type WidgetAnchor = {
  id: string;
  pid: number;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};
export type WidgetTarget = { id: string; pid: number; title: string };
export type WidgetConfig = {
  kind: WidgetKind;
  enabled: boolean;
  mode: "desktop" | "overlay";
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  locked: boolean;
  size_multiplier?: number;
  blur_level?: number;
  tint?: number;
  blur: boolean;
  auto_scroll: boolean;
  anchor: WidgetAnchor | null;
};
export type WidgetPack = {
  installed: boolean;
  snap: boolean;
  widgets: WidgetConfig[];
};
export type WidgetData = {
  remaining: number | null;
  target: number | null;
  balance: number | null;
  players: { name: string; uuid: string }[];
  checkedAt: number;
  errors: Partial<Record<WidgetKind, string>>;
};
export const widgetSizes = [1, 1.5, 2, 2.5, 3];
export const widgetKind = (value: string | null): value is WidgetKind =>
  widgetDefinitions.some((w) => w.kind === value);
export const validWidgetSize = (value: number) => widgetSizes.includes(value);
export const widgetPixels = (value: number) => {
  if (!validWidgetSize(value))
    throw Error("Choose a size from 1 to 3 in half-unit steps.");
  return value * 200;
};
export const readWidgetPack = () => invoke<WidgetPack>("widgets_state");
export const installWidgetPack = (enabled: boolean) =>
  invoke<WidgetPack>("widgets_install", { enabled });
export const setWidget = (widget: WidgetConfig) =>
  invoke<WidgetPack>("widgets_set", { widget });
export const setWidgetSnapping = (enabled: boolean) =>
  invoke<WidgetPack>("widgets_snap", { enabled });
export const openWidgetMain = (settings = false) =>
  invoke("widgets_open_main", { settings });
export const readWidgetWindows = () =>
  invoke<WidgetTarget[]>("widgets_windows");
export const shouldAutoScroll = (
  kind: WidgetKind,
  locked: boolean,
  enabled: boolean,
) => kind === "online" && locked && enabled;
export function widgetScrollStep(
  position: number,
  direction: number,
  elapsed: number,
  maximum: number,
) {
  const next =
    position + direction * Math.min(50, Math.max(0, elapsed)) * 0.012;
  return {
    position: Math.max(0, Math.min(maximum, next)),
    direction: next >= maximum ? -1 : next <= 0 ? 1 : direction,
    pause: next >= maximum || next <= 0,
  };
}
export const widgetError = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);
export const desktopPacksAvailable = () => isTauri();
export function widgetVoteProgress(
  data: Pick<WidgetData, "remaining" | "target">,
) {
  return typeof data.target === "number" &&
    Number.isFinite(data.target) &&
    data.target > 0 &&
    typeof data.remaining === "number" &&
    Number.isFinite(data.remaining) &&
    data.remaining >= 0
    ? Math.max(0, Math.min(100, (1 - data.remaining / data.target) * 100))
    : null;
}

export type SharedWidgetSettings = {locked:boolean;size_multiplier:number;blur_level:number;tint:number};
export const sharedWidgetSettings=(pack:WidgetPack):SharedWidgetSettings=>({locked:pack.widgets[0]?.locked??false,size_multiplier:pack.widgets[0]?.size_multiplier??1,blur_level:pack.widgets[0]?.blur_level??1,tint:pack.widgets[0]?.tint??0.75});
export const setWidgetPreferences=(settings:SharedWidgetSettings)=>invoke<WidgetPack>("widgets_preferences",{settings});
