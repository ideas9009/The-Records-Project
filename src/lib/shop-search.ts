export const shopTypes = {
  stall: "Stall",
  small_shop: "Small shop",
  medium_shop: "Medium shop",
  big_shop: "Big shop",
  market: "Market",
  mall: "Mall",
} as const;
export type ShopListing = {
  id: string;
  kind: "shop" | "bulk";
  title: string;
  town: string;
  description: string;
  items: string[];
  shopType: keyof typeof shopTypes | null;
  priceGold: number | null;
  ownerUid: string;
  username: string;
  active: boolean;
  version: number;
  updatedAt: string;
};
const oneLine = (value: string) =>
  value.replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
export const townSpawnCommand = (town: string) => "/t spawn " + oneLine(town);
export const bulkMailCommand = (
  listing: Pick<ShopListing, "username" | "items">,
) =>
  "/mail " +
  oneLine(listing.username) +
  " I am interested on your posting (" +
  listing.items.map(oneLine).join(", ") +
  ") on The Records Project, Bulk selling page, Mail me back or chat with me if you are interested";
export async function copyShopCommand(command: string) {
  if ("__TAURI_INTERNALS__" in window) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(command);
  } else await navigator.clipboard.writeText(command);
}
