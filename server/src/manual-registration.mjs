import { randomUUID } from "node:crypto";
import {
  ApiError,
  username,
  password,
  digest,
  sessionToken,
  hashPassword,
  publicProfile,
  reviewer,
  rolesOf,
  hasRole,
} from "./security.mjs";
import {
  normalUuid,
  earthMcApiUuid,
  mapEarthMcRanks,
} from "./earthmc-verification.mjs";
const base = "nations/byzantium";
const townKey = (name) =>
  Buffer.from(name.trim().replace(/\s+/g, " ").toLowerCase()).toString(
    "base64url",
  );
const fingerprint = (s) =>
  digest(
    JSON.stringify([
      s.minecraftUuid,
      s.username,
      s.town,
      s.nation,
      s.isMayor,
      s.isCapital,
      s.roles,
      s.unknownRanks,
    ]),
  );
const sameName = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
export async function lookupManualEarthMc(name, { fetchImpl = fetch } = {}) {
  const query = async (type, id) => {
    let response, items;
    try {
      response = await fetchImpl("https://api.earthmc.net/v4/" + type, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: [earthMcApiUuid(id) || id] }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (response.status === 404) return [];
      if (!response.ok) throw Error();
      items = await response.json();
      if (!Array.isArray(items)) throw Error();
    } catch {
      throw new ApiError(
        503,
        "EMC is temporarily unavailable. Please try again; your registration has not been submitted.",
      );
    }
    return items;
  };
  const player = (await query("players", name)).find((p) =>
    sameName(p?.name, name),
  );
  if (!player)
    throw new ApiError(
      422,
      "This username does not exist in EMC's public records. Check the spelling or the player's API privacy settings.",
    );
  const id = normalUuid(player.uuid);
  if (
    !id ||
    player.status?.isNPC ||
    !sameName(player.nation?.name, "Byzantium")
  )
    throw new ApiError(
      403,
      "Registration is available to Byzantine EMC players only.",
    );
  const townId = normalUuid(player.town?.uuid);
  const town = townId
    ? (await query("towns", townId)).find((t) => normalUuid(t.uuid) === townId)
    : null;
  if (
    !town ||
    !sameName(town.nation?.name, "Byzantium") ||
    !normalUuid(player.nation?.uuid) ||
    normalUuid(town.nation?.uuid) !== normalUuid(player.nation.uuid) ||
    !normalUuid(town.mayor?.uuid)
  )
    throw new ApiError(
      503,
      "Your EMC town and mayor could not be confirmed. Please try again.",
    );
  const mapped = mapEarthMcRanks(player, town);
  if (player.status?.isMayor !== (normalUuid(town.mayor.uuid) === id))
    throw new ApiError(
      503,
      "EMC mayor records disagree. Please try again later.",
    );

  if (player.status?.isMayor === true && !mapped.mayor)
    throw new ApiError(
      409,
      "EMC mayor records disagree. Please try again later.",
    );
  const stat = (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  return {
    username: player.name,
    minecraftUuid: id,
    nation: { name: player.nation.name, uuid: normalUuid(player.nation.uuid) },
    town: {
      name: town.name,
      uuid: townId,
      mayorUuid: normalUuid(town.mayor.uuid),
      mayorName: town.mayor.name || "",
    },
    isMayor: mapped.mayor,
    isCapital: town.status?.isCapital === true,
    roles: mapped.roles,
    unknownRanks: mapped.unknown,
    ranks: [
      ...(player.ranks?.nationRanks || []),
      ...(player.ranks?.townRanks || []),
      ...(player.title ? [player.title] : []),
    ]
      .filter((r) => typeof r === "string")
      .map((r) => r.replace(/<[^>]*>/g, "").slice(0, 100))
      .slice(0, 60),
    balance: stat(player.stats?.balance),
    townBalance: mapped.mayor ? stat(town.stats?.balance) : null,
    earthmcResidents: stat(town.stats?.numResidents),
    claimedChunks: stat(town.stats?.numTownBlocks),
  };
}
export function createManualRegistration(
  store,
  {
    now = Date.now,
    rate,
    session,
    lookup = lookupManualEarthMc,
    fetchImpl,
  } = {},
) {
  const stamp = () => new Date(now()).toISOString();
  const fresh = (name) => lookup(name, { fetchImpl });
  async function townRecord(snapshot, reader = store) {
    const map = await reader.get(base + "/earthmc_towns/" + snapshot.town.uuid);
    const byName = await reader.get(
      base + "/town_names/" + townKey(snapshot.town.name),
    );
    const id = map?.id || byName?.id;
    const town = id ? await reader.get(base + "/towns/" + id) : null;
    if (
      !town ||
      town.testData ||
      town.id === "test-town" ||
      (town.earthmcUuid && normalUuid(town.earthmcUuid) !== snapshot.town.uuid)
    )
      return { id: null, town: null };
    return { id, town };
  }
  async function mayorReady(town, snapshot, reader = store) {
    if (!town) return false;
    const ids = [
      ...new Set([
        ...(town.mayorUids || []),
        ...(town.mayorUid ? [town.mayorUid] : []),
      ]),
    ];
    const owners = await Promise.all(
      ids.map((id) => reader.get("users/" + id)),
    );
    return owners.some(
      (p) =>
        p?.authType === "records" &&
        p.nation === "byzantium" &&
        p.status === "approved" &&
        (p.minecraftUuid
          ? normalUuid(p.minecraftUuid) === snapshot.town.mayorUuid
          : sameName(p.username, snapshot.town.mayorName)),
    );
  }
  async function registrationState(user) {
    if (
      user.registrationMethod !== "manual-emc" ||
      user.status !== "pending" ||
      !user.registration
    )
      return {};
    const { town } = await townRecord(user.registration);
    const ready =
      user.registration.isMayor || (await mayorReady(town, user.registration));
    return {
      registrationReady: ready,
      registrationWaiting: ready
        ? "Awaiting administrator identity review."
        : "Waiting for " +
          user.registration.town.mayorName +
          " to register and have " +
          user.registration.town.name +
          " approved.",
    };
  }
  async function manualLookup(body, ip) {
    await rate("manual-lookup:" + ip, 20);
    const name = username(body.username),
      snapshot = await fresh(name);
    if (await store.get("account_names/" + snapshot.username.toLowerCase()))
      throw new ApiError(
        409,
        "This username is already registered. Sign in to your existing account.",
      );
    const { town } = await townRecord(snapshot),
      ready = await mayorReady(town, snapshot);
    const receipt = sessionToken(),
      expiresAt = now() + 10 * 60000;
    await store.set("server_registration_receipts/" + digest(receipt), {
      snapshot,
      expiresAt,
      createdAt: stamp(),
    });
    return {
      receipt,
      expiresAt,
      profile: { ...snapshot, townRegistered: !!town, mayorRegistered: ready },
      approvalRequired: true,
    };
  }
  async function registerManual(body, ip) {
    await rate("register:" + ip, 5);
    const name = username(body.username),
      secret = password(body.password);
    if (
      body.confirmed !== true ||
      typeof body.receipt !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.receipt)
    )
      throw new ApiError(
        400,
        "Look up and confirm your EMC profile before setting your password.",
      );
    const path = "server_registration_receipts/" + digest(body.receipt),
      receipt = await store.get(path);
    if (!receipt || receipt.expiresAt <= now())
      throw new ApiError(
        410,
        "Your EMC profile confirmation expired. Look up your username again.",
      );
    if (!sameName(receipt.snapshot.username, name))
      throw new ApiError(409, "Confirm the EMC profile for this username.");
    const snapshot = await fresh(receipt.snapshot.username);
    if (fingerprint(snapshot) !== fingerprint(receipt.snapshot))
      throw new ApiError(
        409,
        "Your EMC identity or town changed. Look up and confirm your profile again.",
      );
    const credentials = await hashPassword(secret),
      uid = randomUUID(),
      lower = snapshot.username.toLowerCase();
    const profile = {
      uid,
      username: snapshot.username,
      usernameLower: lower,
      authType: "records",
      nation: "byzantium",
      role: "member",
      roles: ["citizen"],
      status: "pending",
      createdAt: stamp(),
      registrationMethod: "manual-emc",
      registration: snapshot,
      minecraftUuid: snapshot.minecraftUuid,
      minecraftVerified: false,
      earthmcTownUuid: snapshot.town.uuid,
      earthmcTownName: snapshot.town.name,
    };
    await store.transaction(async (tx) => {
      const current = await tx.get(path),
        existing = await tx.get("account_names/" + lower),
        verifiedClaim = await tx.get(
          "minecraft_accounts/" + snapshot.minecraftUuid,
        );
      if (
        !current ||
        current.expiresAt <= now() ||
        fingerprint(current.snapshot) !== fingerprint(snapshot)
      )
        throw new ApiError(
          410,
          "Your EMC confirmation expired or was already used.",
        );
      if (existing || verifiedClaim)
        throw new ApiError(
          409,
          "This Minecraft account is already registered. Please sign in.",
        );
      tx.set("users/" + uid, profile);
      tx.set("account_names/" + lower, { uid });
      tx.set("server_credentials/" + uid, credentials);
      tx.remove(path);
    });
    return {
      token: await session(uid),
      account: {
        ...publicProfile(profile),
        ...(await registrationState(profile)),
      },
    };
  }
  async function approveManual(profile, uid) {
    reviewer(profile);
    const target = await store.get("users/" + uid);
    if (
      target?.registrationMethod !== "manual-emc" ||
      target.emcIdentityReviewed
    )
      return false;
    if (target.status !== "pending")
      throw new ApiError(
        409,
        "Return this registration to pending before reviewing it.",
      );
    const snapshot = await fresh(target.username);
    if (normalUuid(target.minecraftUuid) !== snapshot.minecraftUuid)
      throw new ApiError(
        409,
        "The EMC username now belongs to a different player. This registration needs review.",
      );
    if (fingerprint(snapshot) !== fingerprint(target.registration)) {
      await store.transaction(async (tx) => {
        const current = await tx.get("users/" + uid);
        if (current?.status !== "pending" || current.emcIdentityReviewed)
          throw new ApiError(409, "This request is no longer pending.");
        tx.set("users/" + uid, {
          ...current,
          registration: snapshot,
          earthmcTownUuid: snapshot.town.uuid,
          earthmcTownName: snapshot.town.name,
        });
      });
      throw new ApiError(
        409,
        "The EMC town or mayor changed. Updated information is saved for review; refresh the registration before approving again.",
      );
    }
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        user = await tx.get("users/" + uid);
      reviewer(actor);
      if (
        !user ||
        user.status !== "pending" ||
        user.emcIdentityReviewed ||
        normalUuid(user.minecraftUuid) !== snapshot.minecraftUuid
      )
        throw new ApiError(
          409,
          "This request is no longer pending or its identity changed.",
        );
      if (!hasRole(actor, ["operator"]) && rolesOf(user).includes("operator"))
        throw new ApiError(403, "Only an Operator can approve an Operator.");
      if (
        hasRole(actor, ["admin"]) &&
        !hasRole(actor, ["operator", "leader", "prime_minister"]) &&
        rolesOf(user).some((r) =>
          [
            "operator",
            "leader",
            "prime_minister",
            "admin",
            "minister",
            "deputy",
          ].includes(r),
        )
      )
        throw new ApiError(
          403,
          "A senior reviewer must approve this privileged account.",
        );
      const map = await tx.get(base + "/earthmc_towns/" + snapshot.town.uuid),
        nameMap = await tx.get(
          base + "/town_names/" + townKey(snapshot.town.name),
        );
      const id = map?.id || nameMap?.id || "emc-" + snapshot.town.uuid;
      const town = await tx.get(base + "/towns/" + id),
        details = await tx.get(base + "/town_details/" + id),
        claim = await tx.get("minecraft_accounts/" + snapshot.minecraftUuid);
      const capital =
        snapshot.isMayor && snapshot.isCapital
          ? await tx.get(base + "/town_settings/capital")
          : null;
      const priorReview = await tx.get(base + "/rank_reviews/" + uid);
      const owners = [
        ...new Set([
          ...(town?.mayorUids || []),
          ...(town?.mayorUid ? [town.mayorUid] : []),
        ]),
      ];
      const ready = await mayorReady(town, snapshot, tx);
      if (claim && claim.uid !== uid)
        throw new ApiError(
          409,
          "This Minecraft identity belongs to another account.",
        );
      if (
        town?.testData ||
        id === "test-town" ||
        (town?.earthmcUuid &&
          normalUuid(town.earthmcUuid) !== snapshot.town.uuid)
      )
        throw new ApiError(
          409,
          "The registered town has a different identity.",
        );
      if (snapshot.isMayor && owners.length && !owners.includes(uid))
        throw new ApiError(
          409,
          "This town already has a TRP mayor. Confirm its ownership in Administration first.",
        );
      if (!snapshot.isMayor && (!town || !ready))
        throw new ApiError(
          409,
          "This citizen must wait until their EMC mayor registers and the town is approved.",
        );
      if (
        snapshot.isMayor &&
        snapshot.isCapital &&
        capital &&
        capital.id !== id
      )
        throw new ApiError(
          409,
          "Another capital is already registered. Resolve the capital record first.",
        );
      const seniorReviewer = hasRole(actor, [
        "operator",
        "leader",
        "prime_minister",
      ]);
      const mappedRoles = snapshot.roles.filter((role) =>
        [
          "citizen",
          "mayor",
          "army",
          ...(seniorReviewer
            ? ["leader", "prime_minister", "minister", "deputy"]
            : []),
        ].includes(role),
      );
      const roles = [
        ...new Set([
          ...rolesOf(user),
          "citizen",
          ...(snapshot.isMayor ? ["mayor"] : []),
          ...mappedRoles,
        ]),
      ];
      const updated = {
        ...user,
        status: "approved",
        roles,
        emcIdentityReviewed: true,
        manualReviewedAt: stamp(),
        approvedBy: actor.uid,
        approvedAt: stamp(),
        registration: snapshot,
        earthmcTownUuid: snapshot.town.uuid,
        earthmcTownName: snapshot.town.name,
        townId: id,
      };
      const residents = [
        ...new Set([...(details?.registeredResidents || []), user.username]),
      ];
      const leadership = {
        mayor: snapshot.username,
        mayorUid: uid,
        mayorUids: [...new Set([...owners, uid])],
        mayorNames: [
          ...new Set([...(town?.mayorNames || []), snapshot.username]),
        ],
      };
      const rankRows = [...(snapshot.unknownRanks || [])];
      for (const role of snapshot.roles.filter(
        (r) =>
          !mappedRoles.includes(r) && !["citizen", "mayor", "army"].includes(r),
      )) {
        const rank = role.replaceAll("_", " "),
          source = "nation",
          key = digest(source + ":" + rank);
        if (!rankRows.some((r) => r.key === key))
          rankRows.push({ rank, source, key });
      }
      tx.set("users/" + uid, updated);
      tx.set("minecraft_accounts/" + snapshot.minecraftUuid, {
        uid,
        linkedAt: claim?.linkedAt || stamp(),
        method: "manual-review",
      });
      tx.set(base + "/towns/" + id, {
        ...(town || {}),
        ...(snapshot.isMayor ? leadership : {}),
        id,
        name: town?.name || snapshot.town.name,
        nation: "Byzantium",
        earthmcUuid: snapshot.town.uuid,
        ...(snapshot.isMayor
          ? {
              type:
                town?.type || (snapshot.isCapital ? "capital" : "settlement"),
              testData: false,
              image: town?.image || "/wallpapers/2026-06-09_13.05.52_4K.webp",
              createdAt: town?.createdAt || stamp(),
              version: (town?.version || 0) + 1,
            }
          : {}),
        version: (town?.version || 0) + 1,
        recordsResidents: residents.length,
        earthmcResidents: snapshot.earthmcResidents,
        claimedChunks: snapshot.claimedChunks,
      });
      tx.set(base + "/town_details/" + id, {
        ...(details || {}),
        ...(snapshot.isMayor ? leadership : {}),
        registeredResidents: residents,
      });
      tx.set(base + "/town_names/" + townKey(snapshot.town.name), { id });
      tx.set(base + "/earthmc_towns/" + snapshot.town.uuid, { id });
      if (snapshot.isMayor && snapshot.isCapital)
        tx.set(base + "/town_settings/capital", {
          id,
          name: town?.name || snapshot.town.name,
        });
      if (rankRows.length)
        tx.set(base + "/rank_reviews/" + uid, {
          id: uid,
          uid,
          username: user.username,
          minecraftUuid: snapshot.minecraftUuid,
          nation: "Byzantium",
          town: snapshot.town.name,
          unknownRanks: rankRows,
          status: "pending",
          version: (priorReview?.version || 0) + 1,
          signature: digest(JSON.stringify(rankRows)),
          createdAt: priorReview?.createdAt || stamp(),
          updatedAt: stamp(),
        });
      tx.set(base + "/audit/" + randomUUID(), {
        action: "registration.manual_approved",
        actor: actor.username,
        actorUid: actor.uid,
        target: user.username,
        changes: { town: snapshot.town.name, createdTown: !town, roles },
        createdAt: stamp(),
        updatedAt: stamp(),
      });
    });
    return true;
  }
  async function manualRecheck(profile, body) {
    const uid = body.uid || profile.uid;
    if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(uid))
      throw new ApiError(400, "Invalid registration.");
    if (uid !== profile.uid) reviewer(profile);
    await rate("manual-recheck:" + profile.uid, 12);
    const target = await store.get("users/" + uid);
    if (
      target?.registrationMethod !== "manual-emc" ||
      target.status !== "pending"
    )
      throw new ApiError(
        409,
        "Only pending manual registrations can be rechecked.",
      );
    const snapshot = await fresh(target.username);
    if (normalUuid(target.minecraftUuid) !== snapshot.minecraftUuid)
      throw new ApiError(
        409,
        "This username now belongs to a different EMC player. Contact an administrator.",
      );
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        current = await tx.get("users/" + uid);
      if (uid !== profile.uid) reviewer(actor);
      else if (!actor || actor.status !== "pending")
        throw new ApiError(403, "Your registration is no longer pending.");
      if (
        current?.status !== "pending" ||
        normalUuid(current.minecraftUuid) !== snapshot.minecraftUuid
      )
        throw new ApiError(
          409,
          "This registration changed. Refresh and try again.",
        );
      tx.set("users/" + uid, {
        ...current,
        registration: snapshot,
        earthmcTownUuid: snapshot.town.uuid,
        earthmcTownName: snapshot.town.name,
      });
    });
    return { ok: true };
  }
  return {
    manualLookup,
    registerManual,
    approveManual,
    registrationState,
    manualRecheck,
  };
}
