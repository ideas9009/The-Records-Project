import { randomUUID } from "node:crypto";
import { ApiError } from "./security.mjs";
const base = "nations/byzantium/shop_search";
const shopTypes = [
  "stall",
  "small_shop",
  "medium_shop",
  "big_shop",
  "market",
  "mall",
];
function member(user, write = false) {
  if (
    user?.authType !== "records" ||
    user.nation !== "byzantium" ||
    !(write ? ["approved"] : ["pending", "approved"]).includes(user.status)
  )
    throw new ApiError(
      403,
      write
        ? "Registration approval is required."
        : "Shop Search is unavailable.",
    );
}
function safe(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id))
    throw new ApiError(400, "Invalid listing.");
  return id;
}
function text(value, label, max, optional = false, oneLine = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ||
    (oneLine && /[\r\n]/.test(value))
  )
    throw new ApiError(400, "Enter a valid " + label + ".");
  return value.trim();
}
export function createShopSearch(
  store,
  { now = Date.now, rate = async () => {} } = {},
) {
  const current = async (actor, write = false) => {
    const user = await store.get("users/" + actor.uid);
    member(user, write);
    return user;
  };
  async function list(actor) {
    const user = await current(actor);
    const rows = await (store.listAll
      ? store.listAll(base)
      : store.list(base, null, 10000));
    return rows
      .filter(
        (item) =>
          item.active ||
          (user.status === "approved" && item.ownerUid === user.uid),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => ({
        ...item,
        description: item.description.slice(0, 180),
      }));
  }
  async function get(actor, id) {
    const user = await current(actor, true),
      item = await store.get(base + "/" + safe(id));
    if (!item || (!item.active && item.ownerUid !== user.uid))
      throw new ApiError(404, "Listing not found.");
    return item;
  }
  async function save(actor, body, id) {
    member(actor, true);
    if (id) safe(id);
    await rate("shop-search:" + actor.uid, 40);
    const kind = body.kind;
    if (!["shop", "bulk"].includes(kind))
      throw new ApiError(400, "Choose Shops or Bulk.");
    const title = text(
        body.title,
        kind === "shop" ? "shop name" : "listing title",
        90,
        false,
        true,
      ),
      town = text(body.town, "town name", 80, false, true),
      description = text(body.description, "description", 2000, true);
    if (/[\/\\]/.test(town))
      throw new ApiError(400, "Enter a town name without command separators.");
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 100
    )
      throw new ApiError(400, "List between 1 and 100 available items.");
    const items = body.items.map((item) =>
      text(item, "item", 120, false, true),
    );
    if (kind === "shop" && !shopTypes.includes(body.shopType))
      throw new ApiError(400, "Choose a shop type.");
    const priceGold = kind === "bulk" ? (body.priceGold ?? null) : null;
    if (
      priceGold !== null &&
      (typeof priceGold !== "number" ||
        !Number.isFinite(priceGold) ||
        priceGold < 0 ||
        priceGold > 1000000000 ||
        Math.abs(priceGold * 100 - Math.round(priceGold * 100)) > 0.00001)
    )
      throw new ApiError(400, "Enter a valid asking price in Gold.");
    const listingId = id || randomUUID();
    let result;
    await store.transaction(async (tx) => {
      const user = await tx.get("users/" + actor.uid),
        old = await tx.get(base + "/" + listingId);
      member(user, true);
      if (id && !old) throw new ApiError(404, "Listing not found.");
      if (old && old.ownerUid !== user.uid)
        throw new ApiError(403, "Only the poster can edit this listing.");
      if (old && (body.version !== old.version || kind !== old.kind))
        throw new ApiError(409, "This listing changed. Reload before editing.");
      const stamp = new Date(now()).toISOString();
      result = {
        id: listingId,
        kind,
        title,
        town,
        description,
        items,
        shopType: kind === "shop" ? body.shopType : null,
        priceGold,
        ownerUid: user.uid,
        username: user.username,
        active: old?.active ?? true,
        version: (old?.version || 0) + 1,
        createdAt: old?.createdAt || stamp,
        updatedAt: stamp,
      };
      tx.set(base + "/" + listingId, result);
    });
    return result;
  }
  async function status(actor, id, body) {
    member(actor, true);
    safe(id);
    if (typeof body.active !== "boolean")
      throw new ApiError(400, "Choose an availability status.");
    let result;
    await store.transaction(async (tx) => {
      const user = await tx.get("users/" + actor.uid),
        item = await tx.get(base + "/" + id);
      member(user, true);
      if (!item) throw new ApiError(404, "Listing not found.");
      if (item.ownerUid !== user.uid)
        throw new ApiError(403, "Only the poster can update this listing.");
      if (body.version !== item.version)
        throw new ApiError(409, "This listing changed. Refresh and try again.");
      result = {
        ...item,
        active: body.active,
        version: item.version + 1,
        updatedAt: new Date(now()).toISOString(),
      };
      tx.set(base + "/" + id, result);
    });
    return result;
  }
  return {
    shopSearchList: list,
    shopSearchGet: get,
    shopSearchSave: save,
    shopSearchStatus: status,
  };
}
