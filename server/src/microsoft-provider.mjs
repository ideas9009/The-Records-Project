import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { ApiError, username } from "./security.mjs";
import { normalUuid } from "./earthmc-verification.mjs";
export const MICROSOFT_CLIENT_ID = "8dba1883-5bb6-4c05-b384-ec361a91b886";
export const MICROSOFT_CALLBACK =
  "https://the-records-project-api.onrender.com/api/auth/microsoft/callback";
export function microsoftProvider({ env = process.env, fetcher = fetch } = {}) {
  const clientId = env.MICROSOFT_CLIENT_ID || MICROSOFT_CLIENT_ID,
    redirectUri = env.MICROSOFT_CALLBACK_URL || MICROSOFT_CALLBACK;
  const configured = !!env.MICROSOFT_CLIENT_SECRET;
  const enabled =
    configured &&
    env.MICROSOFT_ENABLED === "true" &&
    env.MINECRAFT_API_APPROVED === "true";
  function requireEnabled() {
    if (!enabled)
      throw new ApiError(
        503,
        "Microsoft verification is not available yet. Use username and password, or manual registration.",
      );
  }
  async function json(url, options, label) {
    let response;
    try {
      response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ApiError(503, label + " is unavailable. Please retry.");
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        503,
        label + " returned an invalid response. Please retry.",
      );
    }
    if (!response.ok) {
      if (url.includes("xsts") && body.XErr === 2148916233)
        throw new ApiError(
          422,
          "Create your Xbox profile on xbox.com, then try again.",
        );
      if (url.includes("xsts") && body.XErr === 2148916238)
        throw new ApiError(
          422,
          "Microsoft requires family account setup before this account can continue. Use manual verification if needed.",
        );
      throw new ApiError(
        response.status === 403 ? 503 : 422,
        label +
          " could not verify this account. Check account access or use manual verification.",
      );
    }
    return body;
  }
  return {
    config: () => ({
      clientId,
      configured,
      enabled,
      approvalRequired: env.MINECRAFT_API_APPROVED !== "true",
    }),
    authorizationUrl(state, verifier) {
      requireEnabled();
      const url = new URL(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
      );
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: "XboxLive.signin",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return url.toString();
    },
    async exchange(code, verifier) {
      requireEnabled();
      const tokens = await json(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: env.MICROSOFT_CLIENT_SECRET,
            code,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
            scope: "XboxLive.signin",
          }).toString(),
        },
        "Microsoft",
      );
      if (typeof tokens.access_token !== "string")
        throw new ApiError(
          422,
          "Microsoft sign-in did not complete. Please retry.",
        );
      const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
        proof = {
          ...keys.publicKey.export({ format: "jwk" }),
          alg: "ES256",
          use: "sig",
        };
      async function xbox(url, payload) {
        const body = JSON.stringify(payload),
          timestamp = Buffer.alloc(8);
        timestamp.writeBigUInt64BE(
          (BigInt(Math.floor(Date.now() / 1000)) + 11644473600n) * 10000000n,
        );
        const policy = Buffer.from([0, 0, 0, 1]),
          zero = Buffer.from([0]);
        const input = Buffer.concat([
          policy,
          zero,
          timestamp,
          zero,
          Buffer.from("POST"),
          zero,
          Buffer.from(new URL(url).pathname),
          zero,
          zero,
          Buffer.from(body),
          zero,
        ]);
        const signature = sign("sha256", input, {
          key: keys.privateKey,
          dsaEncoding: "ieee-p1363",
        });
        return json(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-xbl-contract-version": "1",
              Signature: Buffer.concat([policy, timestamp, signature]).toString(
                "base64",
              ),
            },
            body,
          },
          "Xbox",
        );
      }
      const user = await xbox(
        "https://user.auth.xboxlive.com/user/authenticate",
        {
          Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: "d=" + tokens.access_token,
          },
          RelyingParty: "http://auth.xboxlive.com",
          TokenType: "JWT",
        },
      );
      if (typeof user.Token !== "string")
        throw new ApiError(422, "Xbox profile verification failed.");
      const xsts = await xbox("https://xsts.auth.xboxlive.com/xsts/authorize", {
          Properties: {
            SandboxId: "RETAIL",
            UserTokens: [user.Token],
            ProofKey: proof,
          },
          RelyingParty: "rp://api.minecraftservices.com/",
          TokenType: "JWT",
        }),
        hash = xsts.DisplayClaims?.xui?.[0]?.uhs;
      if (typeof xsts.Token !== "string" || typeof hash !== "string")
        throw new ApiError(422, "Xbox profile verification failed.");
      const minecraft = await json(
        "https://api.minecraftservices.com/authentication/login_with_xbox",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identityToken: "XBL3.0 x=" + hash + ";" + xsts.Token,
          }),
        },
        "Minecraft",
      );
      if (typeof minecraft.access_token !== "string")
        throw new ApiError(422, "Minecraft authentication failed.");
      const headers = { Authorization: "Bearer " + minecraft.access_token };
      const entitlements = await json(
        "https://api.minecraftservices.com/entitlements/mcstore",
        { headers },
        "Minecraft",
      );
      if (
        !Array.isArray(entitlements.items) ||
        !entitlements.items.some((item) =>
          ["game_minecraft", "product_minecraft"].includes(item.name),
        )
      )
        throw new ApiError(
          422,
          "This Microsoft account does not have a verified Minecraft Java entitlement. Use manual verification if needed.",
        );
      const profile = await json(
          "https://api.minecraftservices.com/minecraft/profile",
          { headers },
          "Minecraft",
        ),
        uuid = normalUuid(profile.id);
      if (!uuid)
        throw new ApiError(422, "A Minecraft Java profile could not be found.");
      const skin = profile.skins?.find((item) => item.state === "ACTIVE")?.url;
      return {
        uuid,
        username: username(profile.name),
        skin:
          typeof skin === "string" &&
          /^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i.test(skin)
            ? skin
            : null,
      };
    },
  };
}
