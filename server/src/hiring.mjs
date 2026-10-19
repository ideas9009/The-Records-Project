import { ApiError, digest } from "./security.mjs";
const base = "nations/byzantium",
  listings = base + "/availability",
  threads = base + "/hiring";
function member(user) {
  if (
    user?.authType !== "records" ||
    user.nation !== "byzantium" ||
    user.status !== "approved"
  )
    throw new ApiError(403, "Approved membership is required.");
}
function text(value, label, max) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new ApiError(400, "Enter a valid " + label + ".");
  return value.trim();
}
function safe(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value))
    throw new ApiError(400, "Invalid identifier.");
  return value;
}
function amount(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000000000 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  )
    throw new ApiError(
      400,
      "Enter a valid Gold range with up to two decimal places.",
    );
  return value;
}
export function createHiring(
  store,
  { now = Date.now, rate = async () => {} } = {},
) {
  const stamp = () => new Date(now()).toISOString();
  const profile = async (actor) => {
    const user = await store.get("users/" + actor.uid);
    member(user);
    return user;
  };
  const index = (uid, id) => base + "/hiring_inboxes/" + uid + "/threads/" + id;
  async function availabilityList(actor) {
    await profile(actor);
    return (await store.list(listings, ["active", true], 200)).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async function availabilityMine(actor) {
    await profile(actor);
    return store.get(listings + "/" + actor.uid);
  }
  async function availabilitySave(actor, body) {
    member(actor);
    await rate("available:" + actor.uid, 24);
    const title = text(body.title, "title", 80),
      description = text(body.description, "description", 2000),
      minGold = amount(body.minGold),
      maxGold = amount(body.maxGold);
    if (minGold > maxGold)
      throw new ApiError(400, "The minimum amount cannot exceed the maximum.");
    if (
      !["daily", "weekly", "monthly"].includes(body.period) ||
      typeof body.active !== "boolean"
    )
      throw new ApiError(400, "Choose a pay period and availability status.");
    let result;
    await store.transaction(async (tx) => {
      const user = await tx.get("users/" + actor.uid),
        old = await tx.get(listings + "/" + actor.uid);
      member(user);
      if (body.version !== (old?.version || 0))
        throw new ApiError(
          409,
          "Your availability changed. Reload before saving.",
        );
      result = {
        id: user.uid,
        ownerUid: user.uid,
        username: user.username,
        title,
        description,
        minGold,
        maxGold,
        period: body.period,
        active: body.active,
        version: (old?.version || 0) + 1,
        createdAt: old?.createdAt || stamp(),
        updatedAt: stamp(),
      };
      tx.set(listings + "/" + user.uid, result);
    });
    return result;
  }
  const participant = (actor, thread) => {
    member(actor);
    if (!thread) throw new ApiError(404, "Conversation not found.");
    if (![thread.workerUid, thread.employerUid].includes(actor.uid))
      throw new ApiError(403, "This conversation is private.");
  };
  async function send(actor, id, body, workerUid) {
    member(actor);
    const message = text(body.message, "message", 3000),
      clientId = safe(body.clientId);
    await rate("hiring-message:" + actor.uid, 120);
    let result;
    await store.transaction(async (tx) => {
      const user = await tx.get("users/" + actor.uid);
      member(user);
      const listing = workerUid
        ? await tx.get(listings + "/" + safe(workerUid))
        : null;
      let thread = await tx.get(threads + "/" + id);
      if (workerUid) {
        if (!listing || !listing.active)
          throw new ApiError(
            409,
            "This member is no longer advertising availability.",
          );
        if (workerUid === user.uid)
          throw new ApiError(400, "You cannot hire yourself.");
      }
      if (!thread && workerUid)
        thread = {
          id,
          workerUid,
          workerName: listing.username,
          employerUid: user.uid,
          employerName: user.username,
          listingTitle: listing.title,
          minGold: listing.minGold,
          maxGold: listing.maxGold,
          period: listing.period,
          lastSeq: 0,
          createdAt: stamp(),
        };
      participant(user, thread);
      const otherUid =
        user.uid === thread.workerUid ? thread.employerUid : thread.workerUid;
      const other = await tx.get("users/" + otherUid);
      member(other);
      const receipt = await tx.get(
        threads + "/" + id + "/receipts/" + user.uid + "_" + clientId,
      );
      if (receipt) {
        result = { id, seq: receipt.seq };
        return;
      }
      const otherIndex = await tx.get(index(otherUid, id));
      const seq = thread.lastSeq + 1,
        updatedAt = stamp(),
        entry = {
          id: String(seq).padStart(12, "0"),
          seq,
          senderUid: user.uid,
          senderName: user.username,
          text: message,
          createdAt: updatedAt,
        };
      const next = { ...thread, lastSeq: seq, updatedAt };
      tx.set(threads + "/" + id, next);
      tx.set(threads + "/" + id + "/messages/" + entry.id, entry);
      tx.set(threads + "/" + id + "/receipts/" + user.uid + "_" + clientId, {
        seq,
      });
      for (const [person, peer, readSeq] of [
        [user, other, seq],
        [other, user, otherIndex?.readSeq || 0],
      ])
        tx.set(index(person.uid, id), {
          id,
          otherUid: peer.uid,
          otherName: peer.username,
          listingTitle: thread.listingTitle,
          lastMessage: message.slice(0, 180),
          lastSeq: seq,
          readSeq,
          updatedAt,
        });
      result = { id, seq };
    });
    return result;
  }
  async function hireStart(actor, workerUid, body) {
    safe(workerUid);
    return send(actor, digest(workerUid + ":" + actor.uid), body, workerUid);
  }
  async function inbox(actor) {
    await profile(actor);
    const path = base + "/hiring_inboxes/" + actor.uid + "/threads";
    return store.inboxRows
      ? store.inboxRows(path)
      : (await store.list(path, null, 10000))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 100);
  }
  async function conversation(actor, id, before) {
    safe(id);
    const user = await profile(actor),
      thread = await store.get(threads + "/" + id);
    participant(user, thread);
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
      throw new ApiError(400, "Invalid message page.");
    const path = threads + "/" + id + "/messages";
    const rows = store.chatMessages
      ? await store.chatMessages(path, before)
      : (await store.list(path, null, 10000))
          .filter((row) => !before || row.seq < before)
          .sort((a, b) => b.seq - a.seq)
          .slice(0, 50);
    return {
      thread,
      messages: rows.reverse(),
      hasEarlier: rows.length === 50 && rows[0]?.seq > 1,
    };
  }
  async function markRead(actor, id, body) {
    safe(id);
    await store.transaction(async (tx) => {
      const user = await tx.get("users/" + actor.uid),
        thread = await tx.get(threads + "/" + id),
        entry = await tx.get(index(actor.uid, id));
      participant(user, thread);
      if (
        !Number.isSafeInteger(body.seq) ||
        body.seq < 0 ||
        body.seq > thread.lastSeq
      )
        throw new ApiError(400, "Invalid read position.");
      if (entry)
        tx.set(index(actor.uid, id), {
          ...entry,
          readSeq: Math.max(entry.readSeq || 0, body.seq),
        });
    });
    return { ok: true };
  }
  return {
    availabilityGet: async (actor, id) => {
      await profile(actor);
      const item = await store.get(listings + "/" + safe(id));
      if (!item || (!item.active && item.ownerUid !== actor.uid))
        throw new ApiError(404, "Availability not found.");
      return item;
    },
    availabilityList,
    availabilityMine,
    availabilitySave,
    hireStart,
    hiringInbox: inbox,
    hiringGet: conversation,
    hiringSend: (actor, id, body) => send(actor, safe(id), body),
    hiringRead: markRead,
  };
}
