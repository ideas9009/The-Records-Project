# Microsoft verification setup

Status: implementation prepared; NOT ENABLED pending production configuration and Minecraft API approval. Public client ID: 8dba1883-5bb6-4c05-b384-ec361a91b886. Client secret must be entered directly in Render. The existing manual registration and password sign-in remain operational. Army and the rank review queue are available independently.

## Register the Microsoft application

1. Open https://entra.microsoft.com/ and choose Identity → Applications → App registrations → New registration. An Entra directory with permission to register apps is required.
2. Name: The Records Project.
3. Supported account types: Personal Microsoft accounts only. Minecraft Java identities are personal Microsoft accounts.
4. Redirect platform: Web. URI: https://the-records-project-api.onrender.com/api/auth/microsoft/callback
5. Register the app. The Application (client) ID is public and can be shared with the developer. Do not share passwords or client secrets in chat.
6. A server-side confidential-client flow will require a credential stored only in Render, never in React/Tauri or Git. Create and enter that credential directly in Render when the callback implementation is ready. The callback is deployed with the server; sign-in remains gated by the flags below.
7. Complete Minecraft's Java Edition Game Service API review/application process for this exact client ID. Microsoft sign-in alone is not Minecraft ownership verification. API access approval is an external dependency and its timing cannot be guaranteed.

## Authentication flow

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

## Enable only after approval

Render environment: MICROSOFT_CLIENT_SECRET is the secret Value, not its ID. MICROSOFT_CLIENT_ID defaults to the public ID above. MICROSOFT_CALLBACK_URL defaults to the exact HTTPS callback above. Set MINECRAFT_API_APPROVED=true only after actual approval for this app, then MICROSOFT_ENABLED=true to enable the buttons. Configuration endpoint reports booleans and public ID only. The app checks this online. Never set VITE_MICROSOFT_CLIENT_SECRET.

One-use state, PKCE verifier and independent poll secret bind each handoff. Expiry: 10 minutes. Callback page has no external content or token handoff URLs. Provider tokens are used in memory only and refresh-token scope is not requested. Ready private confirmation snapshots expire and are deleted on completion/cancel, with server cleanup of abandoned expired records every 10 minutes while running. Final submission rechecks EarthMC membership and requires reconfirmation after privilege/town changes. Existing accounts link only through an authenticated same-username action; a UUID already linked elsewhere is rejected. No username-only merging.

New Microsoft registration sets the password after confirming the profile. Confirmed verified members are approved automatically, including residents whose mayor has not registered. Mayors register/link towns transactionally; conflicting existing ownership requires administrator intervention. Pending town affiliations are joined by verified EarthMC town UUID on read once the mayor registers. Rank reviews are created atomically with registration/linking. Returning sign-in preserves manually assigned roles. It does not provide ongoing revocation of EarthMC-derived roles; administrators retain moderation controls.

Production enablement is blocked until Minecraft API approval and a live consent test. Mocked integration tests do not establish external approval. Microsoft/Xbox accounts requiring additional Xbox or family setup receive an error and can use manual verification.

Existing unlinked accounts receive an optional “Recommended: Link with Microsoft” card after sign-in once the provider is enabled. “Not now” is stored only on that device for that account. Linking remains available in My Profile. The recommendation is never shown as a requirement for accessing the app.
