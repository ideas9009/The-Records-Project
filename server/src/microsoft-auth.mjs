import { randomUUID } from "node:crypto";
import {
  ApiError,
  digest,
  sessionToken,
  hashPassword,
  password,
  publicProfile,
  rolesOf,
} from "./security.mjs";
import { earthMcConfirmation } from "./earthmc-verification.mjs";
import { microsoftProvider } from "./microsoft-provider.mjs";
const base = "nations/byzantium",
  lifetime = 10 * 60000;
const validSecret = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const townKey = (name) =>
  Buffer.from(name.trim().replace(/\s+/g, " ").toLowerCase()).toString(
    "base64url",
  );
const signature = (snapshot) =>
  digest(
    JSON.stringify([
      snapshot.minecraftUuid,
      snapshot.town.uuid,
      snapshot.nation.uuid,
      snapshot.isMayor,
      snapshot.roles,
      snapshot.unknownRanks,
    ]),
  );
export function createMicrosoftAuth(
  store,
  {
    now = Date.now,
    provider = microsoftProvider(),
    confirmation = earthMcConfirmation,
    authenticate,
    session,
    rate,
  } = {},
) {
  const path = (id) => "server_oauth/" + digest(id);
  const stamp = () => new Date(now()).toISOString();
  async function readFlow(body) {
    if (!validSecret(body.id) || !validSecret(body.secret))
      throw new ApiError(401, "Invalid Microsoft verification session.");
    const flow = await store.get(path(body.id));
    if (
      !flow ||
      flow.secretHash !== digest(body.secret) ||
      flow.expiresAt <= now()
    )
      throw new ApiError(410, "Microsoft verification expired. Start again.");
    return flow;
  }
  async function microsoftStart(body, token, ip) {
    await rate("microsoft-start:" + ip, 8);
    if (!["login", "register", "link"].includes(body.mode))
      throw new ApiError(400, "Choose Microsoft sign-in or registration.");
    const linked = body.mode === "link" ? await authenticate(token) : null;
    const id = sessionToken(),
      secret = sessionToken(),
      verifier = sessionToken(),
      url = provider.authorizationUrl(id, verifier);
    await store.set(path(id), {
      status: "waiting",
      mode: body.mode,
      linkedUid: linked?.uid || null,
      secretHash: digest(secret),
      verifier,
      expiresAt: now() + lifetime,
      createdAt: stamp(),
    });
    return { id, secret, url, expiresAt: now() + lifetime };
  }
  async function microsoftCallback(query) {
    const id = query.get("state");
    if (!validSecret(id) || query.getAll("state").length !== 1)
      throw new ApiError(400, "Invalid Microsoft verification state.");
    let flow;
    await store.transaction(async (tx) => {
      flow = await tx.get(path(id));
      if (!flow || flow.status !== "waiting" || flow.expiresAt <= now())
        throw new ApiError(
          410,
          "This Microsoft verification has expired or was already used.",
        );
      tx.set(path(id), { ...flow, status: "processing" });
    });
    try {
      if (query.has("error"))
        throw new ApiError(
          422,
          "Microsoft sign-in was cancelled or denied. You can try again.",
        );
      const code = query.get("code");
      if (
        typeof code !== "string" ||
        !code ||
        code.length > 12000 ||
        query.getAll("code").length !== 1
      )
        throw new ApiError(
          400,
          "Microsoft did not return a valid authorization code.",
        );
      const identity = await provider.exchange(code, flow.verifier),
        snapshot = await confirmation(identity);
      const townMap = await store.get(
        base + "/earthmc_towns/" + snapshot.town.uuid,
      );
      await store.transaction(async (tx) => {
        const current = await tx.get(path(id));
        if (
          !current ||
          current.status !== "processing" ||
          current.expiresAt <= now()
        )
          throw new ApiError(410, "This verification expired. Start again.");
        const { verifier, ...retained } = current;
        tx.set(path(id), {
          ...retained,
          status: "ready",
          identity: {
            uuid: identity.uuid,
            username: identity.username,
            skin: identity.skin || null,
          },
          snapshot,
          confirmationDigest: signature(snapshot),
          townRegistered: !!townMap,
        });
      });
      return { ok: true };
    } catch (error) {
      await store.transaction(async (tx) => {
        const current = await tx.get(path(id));
        if (current?.status === "processing") {
          const { verifier, ...retained } = current;
          tx.set(path(id), {
            ...retained,
            status: "failed",
            error:
              error instanceof ApiError
                ? error.message
                : "Microsoft verification could not be completed. Please retry.",
          });
        }
      });
      return { ok: false };
    }
  }
  async function microsoftPoll(body) {
    const flow = await readFlow(body);
    if (flow.status === "failed")
      return { status: "failed", error: flow.error };
    if (flow.status !== "ready") return { status: flow.status };
    return {
      status: "ready",
      mode: flow.mode,
      confirmationDigest: flow.confirmationDigest,
      profile: {
        ...flow.snapshot,
        avatar: flow.identity.skin,
        townRegistered: flow.townRegistered,
      },
    };
  }
  async function microsoftCancel(body) {
    await readFlow(body);
    await store.remove(path(body.id));
    return { ok: true };
  }
  async function microsoftFinish(body, token, ip) {
    await rate("microsoft-finish:" + ip, 12);
    if (!provider.config().enabled)
      throw new ApiError(503, "Microsoft verification is unavailable.");
    const flow = await readFlow(body);
    if (flow.status !== "ready")
      throw new ApiError(409, "Microsoft verification is not ready.");
    if (body.confirmationDigest !== flow.confirmationDigest)
      throw new ApiError(409, "Please confirm the latest profile information.");
    const actor = flow.mode === "link" ? await authenticate(token) : null;
    if (flow.mode === "link" && actor.uid !== flow.linkedUid)
      throw new ApiError(
        403,
        "Sign in to the account that started this verification.",
      );
    const credentials =
      flow.mode === "register"
        ? await hashPassword(password(body.password))
        : null;
    const fresh = await confirmation(flow.identity),
      nextDigest = signature(fresh);
    if (nextDigest !== flow.confirmationDigest) {
      await store.transaction(async (tx) => {
        const current = await tx.get(path(body.id));
        if (!current || current.status !== "ready")
          throw new ApiError(409, "This verification was already used.");
        tx.set(path(body.id), {
          ...current,
          snapshot: fresh,
          confirmationDigest: nextDigest,
        });
      });
      return { confirmationChanged: true };
    }
    const uid = randomUUID(),
      minecraftPath = "minecraft_accounts/" + fresh.minecraftUuid;
    let resultProfile;
    await store.transaction(async (tx) => {
      const current = await tx.get(path(body.id)),
        claim = await tx.get(minecraftPath);
      if (
        !current ||
        current.status !== "ready" ||
        current.secretHash !== digest(body.secret) ||
        current.expiresAt <= now() ||
        current.confirmationDigest !== body.confirmationDigest
      )
        throw new ApiError(
          409,
          "This verification has expired, changed or was already used.",
        );
      const targetUid =
        flow.mode === "register"
          ? uid
          : flow.mode === "link"
            ? flow.linkedUid
            : claim?.uid;
      if (flow.mode === "register" && claim)
        throw new ApiError(
          409,
          "This Minecraft account is already linked. Choose Sign in with Microsoft.",
        );
      if (!targetUid)
        throw new ApiError(
          409,
          "This Minecraft account is not linked yet. Register, or sign in with your username to link an existing account.",
        );
      const old =
        flow.mode === "register" ? null : await tx.get("users/" + targetUid);
      if (
        old &&
        (old.authType !== "records" ||
          old.nation !== "byzantium" ||
          !["pending", "approved"].includes(old.status))
      )
        throw new ApiError(
          403,
          "This account is not available. Contact an administrator.",
        );
      if (
        flow.mode === "login" &&
        old &&
        (old.minecraftVerified !== true ||
          old.minecraftUuid !== fresh.minecraftUuid)
      )
        throw new ApiError(403, "This Minecraft account link is not verified.");
      if (flow.mode !== "register" && !old)
        throw new ApiError(404, "The linked account was not found.");
      if (claim && claim.uid !== targetUid)
        throw new ApiError(
          409,
          "This Minecraft account is linked to another account.",
        );
      if (old?.minecraftUuid && old.minecraftUuid !== fresh.minecraftUuid)
        throw new ApiError(
          409,
          "This Records account is already linked to a different Minecraft account.",
        );
      if (
        flow.mode === "link" &&
        old.username.toLowerCase() !== fresh.username.toLowerCase()
      )
        throw new ApiError(
          409,
          "The Minecraft username does not match your Records account. Contact an administrator.",
        );
      const lower = fresh.username.toLowerCase(),
        nameClaim = await tx.get("account_names/" + lower),
        oldClaim = old
          ? await tx.get("account_names/" + old.username.toLowerCase())
          : null;
      if (nameClaim && nameClaim.uid !== targetUid)
        throw new ApiError(
          409,
          "This username already belongs to an account. Sign in with your existing password and link Microsoft from My Profile.",
        );
      const map = await tx.get(base + "/earthmc_towns/" + fresh.town.uuid),
        nameMap = await tx.get(
          base + "/town_names/" + townKey(fresh.town.name),
        ),
        townId =
          map?.id ||
          (fresh.isMayor ? nameMap?.id : null) ||
          "emc-" + fresh.town.uuid;
      const existingTown = await tx.get(base + "/towns/" + townId),
        details = await tx.get(base + "/town_details/" + townId);
      if (
        fresh.isMayor &&
        existingTown?.mayorUid &&
        existingTown.mayorUid !== targetUid
      )
        throw new ApiError(
          409,
          "This town already has a Records mayor. Contact an administrator to confirm ownership.",
        );
      if (
        existingTown?.earthmcUuid &&
        existingTown.earthmcUuid !== fresh.town.uuid
      )
        throw new ApiError(
          409,
          "Town identity differs from the registered town. Contact an administrator.",
        );
      const linkedTown = (!!map && !!existingTown) || fresh.isMayor;
      // Login preserves existing privileges. Registration/linking grants only verified mapped roles.
      const roles =
        flow.mode === "login"
          ? rolesOf(old)
          : [...new Set([...(old ? rolesOf(old) : []), ...fresh.roles])];
      resultProfile = {
        ...(old || {
          uid: targetUid,
          authType: "records",
          nation: "byzantium",
          createdAt: stamp(),
          role: "citizen",
          status: "approved",
        }),
        username: fresh.username,
        usernameLower: lower,
        roles,
        minecraftUuid: fresh.minecraftUuid,
        minecraftVerified: true,
        earthmcTownUuid: fresh.town.uuid,
        earthmcTownName: fresh.town.name,
        earthmcRanks: fresh.ranks,
      };
      if (flow.mode === "link") resultProfile.status = "approved";
      const existingReview =
        fresh.unknownRanks.length && flow.mode !== "login"
          ? await tx.get(base + "/rank_reviews/" + targetUid)
          : null;
      const reviewSignature = digest(JSON.stringify(fresh.unknownRanks));
      // All reads finish before Firestore writes begin.
      tx.set("users/" + targetUid, resultProfile);
      tx.set("account_names/" + lower, { uid: targetUid });
      if (
        old &&
        old.username.toLowerCase() !== lower &&
        oldClaim?.uid === targetUid
      )
        tx.remove("account_names/" + old.username.toLowerCase());
      tx.set(minecraftPath, {
        uid: targetUid,
        linkedAt: claim?.linkedAt || stamp(),
      });
      if (credentials) tx.set("server_credentials/" + targetUid, credentials);
      if (fresh.isMayor && flow.mode !== "login") {
        const residents = [
          ...new Set([...(details?.registeredResidents || []), fresh.username]),
        ];
        tx.set(base + "/towns/" + townId, {
          ...(existingTown || {}),
          id: townId,
          name: fresh.town.name,
          nation: "Byzantium",
          earthmcUuid: fresh.town.uuid,
          mayor: fresh.username,
          mayorUid: targetUid,
          recordsResidents: residents.length,
          earthmcResidents:
            fresh.earthmcResidents ?? existingTown?.earthmcResidents ?? 0,
          claimedChunks:
            fresh.claimedChunks ?? existingTown?.claimedChunks ?? 0,
          image:
            existingTown?.image || "/wallpapers/2026-06-09_13.05.52_4K.webp",
          testData: false,
        });
        tx.set(base + "/town_details/" + townId, {
          ...(details || {}),
          mayor: fresh.username,
          mayorUid: targetUid,
          registeredResidents: residents,
        });
        tx.set(base + "/town_names/" + townKey(fresh.town.name), {
          id: townId,
        });
        tx.set(base + "/earthmc_towns/" + fresh.town.uuid, { id: townId });
      }
      if (
        fresh.unknownRanks.length &&
        flow.mode !== "login" &&
        existingReview?.signature !== reviewSignature
      )
        tx.set(base + "/rank_reviews/" + targetUid, {
          id: targetUid,
          uid: targetUid,
          username: fresh.username,
          minecraftUuid: fresh.minecraftUuid,
          nation: "Byzantium",
          town: fresh.town.name,
          unknownRanks: fresh.unknownRanks,
          status: "pending",
          version: (existingReview?.version || 0) + 1,
          signature: reviewSignature,
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      tx.set(base + "/audit/" + randomUUID(), {
        actor: fresh.username,
        actorUid: targetUid,
        action: "microsoft." + flow.mode,
        target: fresh.username,
        createdAt: stamp(),
        updatedAt: stamp(),
      });
      tx.remove(path(body.id));
    });
    return {
      token: await session(resultProfile.uid),
      account: publicProfile(resultProfile),
    };
  }
  return {
    microsoftConfig: () => provider.config(),
    microsoftStart,
    microsoftCallback,
    microsoftPoll,
    microsoftCancel,
    microsoftFinish,
  };
}
