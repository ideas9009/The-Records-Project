# Microsoft verification setup

Status: NOT ENABLED. No Microsoft application ID, client credential or Minecraft API approval has been configured. The existing manual registration and password sign-in remain operational. Army and the rank review queue are available independently.

## Register the Microsoft application

1. Open https://entra.microsoft.com/ and choose Identity → Applications → App registrations → New registration. An Entra directory with permission to register apps is required.
2. Name: The Records Project Nostra-2.
3. Supported account types: Personal Microsoft accounts only. Minecraft Java identities are personal Microsoft accounts.
4. Redirect platform: Web. URI: https://the-records-project-api.onrender.com/api/auth/microsoft/callback
5. Register the app. The Application (client) ID is public and can be shared with the developer. Do not share passwords or client secrets in chat.
6. A server-side confidential-client flow will require a credential stored only in Render, never in React/Tauri or Git. Create and enter that credential directly in Render when the callback implementation is ready. This documentation does not claim that the callback is deployed yet.
7. Complete Minecraft's Java Edition Game Service API review/application process for this exact client ID. Microsoft sign-in alone is not Minecraft ownership verification. API access approval is an external dependency and its timing cannot be guaranteed.

## Planned authentication flow (not implemented yet)

Authorization code + PKCE, random one-use state, external system browser, server HTTPS callback. Exchange through Xbox/Minecraft authentication to obtain the authenticated Java UUID and profile; no email-to-username lookup. Do not request or retain refresh tokens for one-time verification. The optional later Microsoft sign-in repeats provider authentication and opens the linked UUID account.

Return results to the desktop through an expiring, secret-bound handoff. No passwords, provider tokens or app sessions in redirect URLs. Existing accounts require authenticated explicit linking; never merge by matching username alone. Final confirmation must refresh EarthMC data and atomically claim the Minecraft UUID, create the account/password hash, attach verified town ownership and queue unknown ranks. A returning user must not lose manually assigned roles.

Confirmation: Minecraft avatar and username, player gold balance, town, nation and EarthMC ranks; town bank balance only for its verified mayor. Missing values are unavailable, not zero. Private balances are not included in Citizens or SmartSync. Town awaiting registration remains recorded; once its verified mayor registers, pending town associations are reconciled by EarthMC town UUID.

## Prepared server modules

earthmc-verification.mjs queries EarthMC v4 using an already authenticated Minecraft UUID, checks player/town identity and nation consistency, and builds a private confirmation snapshot. It is not a replacement for the Microsoft/Minecraft ownership check and has no browser-callable ingestion route.

Rank mapping: Citizen always; verified isKing → Leader; Mayor only when the town mayor UUID matches. Exact nation-rank mappings: Prime Minister, Minister, Deputy, Army, Citizen. Army has Citizen-level access. Town-government rank labels and arbitrary titles do not automatically grant nation-wide privileges. Unrecognized or ambiguous values go to Rank Review. Operator is never inferred from EarthMC.

The internal queueRankReview method accepts only an already verified account with a matching Minecraft UUID. Operator, Leader and Prime Minister can resolve each unknown rank individually; Admin can view requests. Decisions are per-account, audited, version-checked and do not create global mapping rules. Operator and mayor ownership cannot be assigned through this queue.

## Official references

- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri
- https://help.minecraft.net/hc/en-us/sections/44460521913485 (Java Edition Game Service API Review or Application Process)
- https://earthmc.net/docs/api
