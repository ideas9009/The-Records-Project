import { randomUUID } from "node:crypto";
import { ApiError, approved, validPhoto } from "./security.mjs";
const base = "nations/byzantium/task_board";
const id = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new ApiError(400, "Invalid listing identifier.");
  return value;
};
function text(value, label, max, optional = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new ApiError(400, "Enter a valid " + label + ".");
  return value.trim();
}
function gold(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000000000 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  )
    throw new ApiError(
      400,
      "Enter a gold amount with up to two decimal places.",
    );
  return Math.round(value * 100) / 100;
}
function member(actor) {
  if (!actor || actor.authType !== "records" || actor.nation !== "byzantium")
    throw new ApiError(403, "This account cannot use Task Board.");
  approved(actor);
}
const own = (actor, listing) => {
  if (actor.uid !== listing.ownerUid)
    throw new ApiError(403, "Only the publisher can do this.");
};
const assigned = (actor, listing) => {
  if (actor.uid !== listing.assigneeUid)
    throw new ApiError(403, "Only the assigned worker can do this.");
};
const expectState = (listing, state) => {
  if (listing.status !== state)
    throw new ApiError(409, "This listing has changed. Refresh and try again.");
};
function summary(listing) {
  const { description, ...card } = listing;
  return { ...card, description: description.slice(0, 180) };
}
export function createTaskBoard(
  store,
  { now = Date.now, rate = async () => {} } = {},
) {
  async function boardList(profile) {
    member(profile);
    return (await store.newsList(base, null, 200)).map(summary);
  }
  async function boardGet(profile, listingId) {
    member(profile);
    const path = base + "/" + id(listingId),
      listing = await store.get(path);
    if (!listing) throw new ApiError(404, "Listing not found.");
    const owner = listing.ownerUid === profile.uid;
    const [applications, offers, proof] = await Promise.all([
      owner
        ? store.list(path + "/applications", null, 200)
        : store
            .get(path + "/applications/" + profile.uid)
            .then((item) => (item ? [item] : [])),
      owner
        ? store.list(path + "/offers", null, 200)
        : store
            .get(path + "/offers/" + profile.uid)
            .then((item) => (item ? [item] : [])),
      store.get(path + "/proof/current"),
    ]);
    return { ...listing, applications, offers, proof };
  }
  async function boardCreate(profile, body) {
    member(profile);
    await rate("board-create:" + profile.uid, 20);
    if (!["task", "materials"].includes(body.kind))
      throw new ApiError(400, "Choose Tasks or Material Requests.");
    const title = text(body.title, "title", 100),
      description = text(
        body.description,
        "description",
        6000,
        body.kind === "materials",
      ),
      priceGold = gold(body.priceGold);
    let deadline = null;
    if (body.deadline) {
      const time = Date.parse(body.deadline);
      if (!Number.isFinite(time) || time <= now())
        throw new ApiError(400, "Choose a future deadline.");
      deadline = new Date(time).toISOString();
    }
    const materials = body.kind === "materials" ? body.materials : [];
    if (
      !Array.isArray(materials) ||
      (body.kind === "materials" &&
        (!materials.length || materials.length > 50))
    )
      throw new ApiError(400, "Add between 1 and 50 materials.");
    const items = materials.map((item) => {
      if (
        !item ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 1000000
      )
        throw new ApiError(400, "Enter a valid material quantity.");
      return {
        quantity: item.quantity,
        name: text(item.name, "material name", 80),
      };
    });
    if (body.kind === "task" && typeof body.approvalRequired !== "boolean")
      throw new ApiError(400, "Choose how workers join.");
    const listingId = randomUUID(),
      stamp = new Date(now()).toISOString();
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid);
      member(actor);
      tx.set(base + "/" + listingId, {
        id: listingId,
        kind: body.kind,
        title,
        description,
        materials: items,
        priceGold,
        deadline,
        approvalRequired: body.kind === "task" && body.approvalRequired,
        ownerUid: actor.uid,
        ownerName: actor.username,
        assigneeUid: null,
        assigneeName: null,
        agreedGold: null,
        status: "open",
        version: 1,
        createdAt: stamp,
        updatedAt: stamp,
        completedAt: null,
        reviewNote: "",
      });
    });
    return boardGet(profile, listingId);
  }
  async function boardAct(profile, listingId, body) {
    member(profile);
    await rate("board-action:" + profile.uid, 120);
    const path = base + "/" + id(listingId);
    await store.transaction(async (tx) => {
      const [actor, previous] = await Promise.all([
        tx.get("users/" + profile.uid),
        tx.get(path),
      ]);
      member(actor);
      if (!previous) throw new ApiError(404, "Listing not found.");
      if (!Number.isInteger(body.version) || body.version !== previous.version)
        throw new ApiError(
          409,
          "This listing has changed. Refresh and try again.",
        );
      const listing = { ...previous },
        stamp = new Date(now()).toISOString();
      const participant = () => {
        if (actor.uid === listing.ownerUid)
          throw new ApiError(400, "You cannot take your own listing.");
      };
      const claim = (worker, amount) => {
        listing.assigneeUid = worker.uid;
        listing.assigneeName = worker.username;
        listing.agreedGold = amount;
        listing.status = "assigned";
      };
      if (body.action === "join" || body.action === "apply") {
        expectState(listing, "open");
        participant();
        if (listing.deadline && Date.parse(listing.deadline) <= now())
          throw new ApiError(409, "The deadline has passed.");
        if (listing.kind === "task" && listing.approvalRequired) {
          if (body.action !== "apply")
            throw new ApiError(400, "This task requires publisher approval.");
          const applicationPath = path + "/applications/" + actor.uid;
          if (await tx.get(applicationPath))
            throw new ApiError(409, "You already applied for this task.");
          tx.set(applicationPath, {
            uid: actor.uid,
            username: actor.username,
            message: text(body.message, "application", 1000, true),
            createdAt: stamp,
          });
          return;
        }
        if (body.action !== "join")
          throw new ApiError(400, "This listing accepts direct joining.");
        claim(actor, listing.priceGold);
      } else if (body.action === "approve_applicant") {
        own(actor, listing);
        expectState(listing, "open");
        if (listing.kind !== "task" || !listing.approvalRequired)
          throw new ApiError(400, "This task does not require applications.");
        const candidateUid = id(body.candidateUid),
          [application, candidate] = await Promise.all([
            tx.get(path + "/applications/" + candidateUid),
            tx.get("users/" + candidateUid),
          ]);
        if (!application || !candidate || candidate.uid === listing.ownerUid)
          throw new ApiError(400, "Choose a valid applicant.");
        member(candidate);
        claim(candidate, listing.priceGold);
      } else if (
        ["offer", "counter_offer", "accept_offer", "decline_offer"].includes(
          body.action,
        )
      ) {
        expectState(listing, "open");
        if (listing.kind !== "materials")
          throw new ApiError(
            400,
            "Price negotiation is available on material requests.",
          );
        const owner = actor.uid === listing.ownerUid,
          candidateUid = owner ? id(body.candidateUid) : actor.uid;
        const offerPath = path + "/offers/" + candidateUid,
          [old, candidate] = await Promise.all([
            tx.get(offerPath),
            tx.get("users/" + candidateUid),
          ]);
        if (!candidate || candidateUid === listing.ownerUid)
          throw new ApiError(400, "Choose a valid supplier.");
        member(candidate);
        if (body.action === "offer") {
          participant();
          tx.set(offerPath, {
            uid: actor.uid,
            username: actor.username,
            priceGold: gold(body.priceGold),
            message: text(body.message, "offer note", 1000, true),
            lastBy: actor.uid,
            version: (old?.version || 0) + 1,
            status: "pending",
            updatedAt: stamp,
          });
          return;
        }
        if (
          !old ||
          old.status !== "pending" ||
          body.offerVersion !== old.version
        )
          throw new ApiError(
            409,
            "This offer has changed. Refresh and try again.",
          );
        if (body.action === "counter_offer") {
          own(actor, listing);
          tx.set(offerPath, {
            ...old,
            priceGold: gold(body.priceGold),
            message: text(body.message, "offer note", 1000, true),
            lastBy: actor.uid,
            version: old.version + 1,
            updatedAt: stamp,
          });
          return;
        }
        if (body.action === "decline_offer") {
          tx.set(offerPath, {
            ...old,
            status: "declined",
            version: old.version + 1,
            updatedAt: stamp,
          });
          return;
        }
        if (old.lastBy === actor.uid)
          throw new ApiError(400, "The other person must accept your offer.");
        claim(candidate, old.priceGold);
        tx.set(offerPath, {
          ...old,
          status: "accepted",
          version: old.version + 1,
          updatedAt: stamp,
        });
      } else if (body.action === "submit") {
        assigned(actor, listing);
        expectState(listing, "assigned");
        const caption = text(
          body.message,
          "completion note",
          2000,
          listing.kind === "task",
        );
        if (listing.kind === "task" && !validPhoto(body.image))
          throw new ApiError(400, "Attach a valid completion screenshot.");
        if (body.image && !validPhoto(body.image))
          throw new ApiError(400, "Choose a valid JPEG image.");
        tx.set(path + "/proof/current", {
          image: body.image || "",
          message: caption,
          submittedBy: actor.uid,
          submittedName: actor.username,
          submittedAt: stamp,
        });
        listing.status = "submitted";
        listing.reviewNote = "";
      } else if (body.action === "request_changes") {
        own(actor, listing);
        expectState(listing, "submitted");
        listing.reviewNote = text(body.message, "review note", 2000);
        listing.status = "assigned";
      } else if (body.action === "approve_completion") {
        own(actor, listing);
        expectState(listing, "submitted");
        listing.status = "awaiting_payment";
      } else if (body.action === "payment_received") {
        assigned(actor, listing);
        expectState(listing, "awaiting_payment");
        listing.status = "completed";
        listing.completedAt = stamp;
      } else if (body.action === "cancel") {
        own(actor, listing);
        expectState(listing, "open");
        listing.status = "cancelled";
      } else throw new ApiError(400, "Unknown Task Board action.");
      tx.set(path, {
        ...listing,
        version: listing.version + 1,
        updatedAt: stamp,
      });
    });
    return boardGet(profile, listingId);
  }
  return { boardList, boardGet, boardCreate, boardAct };
}
