import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  microsoftProvider,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CALLBACK,
} from "../src/microsoft-provider.mjs";
const env = {
  MICROSOFT_CLIENT_SECRET: "test-secret",
  MICROSOFT_ENABLED: "true",
  MINECRAFT_API_APPROVED: "true",
};
test("client ID is public; both explicit enablement and approval are required", () => {
  const disabled = microsoftProvider({ env: {} });
  assert.equal(disabled.config().clientId, MICROSOFT_CLIENT_ID);
  assert.equal(disabled.config().enabled, false);
  assert.throws(
    () => disabled.authorizationUrl("state", "verifier"),
    (e) => e.status === 503,
  );
  assert.equal(
    microsoftProvider({
      env: { ...env, MINECRAFT_API_APPROVED: "false" },
    }).config().enabled,
    false,
  );
  assert.equal(
    JSON.stringify(microsoftProvider({ env }).config()).includes("test-secret"),
    false,
  );
});
test("authorization requests use PKCE and state, personal accounts and no offline/email scopes", () => {
  const url = new URL(
    microsoftProvider({ env }).authorizationUrl("state", "verifier"),
  );
  assert.equal(url.searchParams.get("client_id"), MICROSOFT_CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), MICROSOFT_CALLBACK);
  assert.equal(url.searchParams.get("state"), "state");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update("verifier").digest("base64url"),
  );
  assert.equal(url.searchParams.get("scope"), "XboxLive.signin");
  assert.equal(url.pathname, "/consumers/oauth2/v2.0/authorize");
});
test("provider exchanges through Microsoft, Xbox and Minecraft and returns only the Java identity", async () => {
  const requests = [],
    responses = [
      { access_token: "msa", refresh_token: "discard-me" },
      { Token: "user" },
      { Token: "xsts", DisplayClaims: { xui: [{ uhs: "hash" }] } },
      { access_token: "minecraft" },
      { items: [{ name: "game_minecraft" }] },
      {
        id: "123456781234123412341234567890ab",
        name: "Player",
        skins: [
          {
            state: "ACTIVE",
            url: "https://textures.minecraft.net/texture/abcdef",
          },
        ],
      },
    ];
  const provider = microsoftProvider({
    env,
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(responses.shift()));
    },
  });
  assert.deepEqual(await provider.exchange("code", "verifier"), {
    uuid: "123456781234123412341234567890ab",
    username: "Player",
    skin: "https://textures.minecraft.net/texture/abcdef",
  });
  assert.equal(requests.length, 6);
  assert.equal(
    new URLSearchParams(requests[0].options.body).get("code_verifier"),
    "verifier",
  );
  assert.equal(
    new URLSearchParams(requests[0].options.body).get("client_secret"),
    "test-secret",
  );
  assert.equal(
    JSON.parse(requests[1].options.body).Properties.RpsTicket,
    "d=msa",
  );
  assert.equal(
    JSON.parse(requests[3].options.body).identityToken,
    "XBL3.0 x=hash;xsts",
  );
  assert.equal(requests[5].options.headers.Authorization, "Bearer minecraft");
  assert.ok(requests.every((request) => request.options.redirect === "error"));
});
test("provider never exposes upstream token/error text on failure", async () => {
  const provider = microsoftProvider({
    env,
    fetcher: async () =>
      new Response(
        JSON.stringify({ error_description: "secret-provider-token" }),
        { status: 400 },
      ),
  });
  await assert.rejects(
    provider.exchange("code", "verifier"),
    (error) =>
      error.status === 422 && !error.message.includes("secret-provider-token"),
  );
});
test("missing Java entitlement stops profile lookup", async () => {
  let calls = 0;
  const responses = [
    { access_token: "msa" },
    { Token: "user" },
    { Token: "xsts", DisplayClaims: { xui: [{ uhs: "hash" }] } },
    { access_token: "minecraft" },
    { items: [] },
  ];
  const provider = microsoftProvider({
    env,
    fetcher: async () => {
      calls++;
      return new Response(JSON.stringify(responses.shift()));
    },
  });
  await assert.rejects(
    provider.exchange("code", "verifier"),
    (error) => error.status === 422,
  );
  assert.equal(calls, 5);
});
