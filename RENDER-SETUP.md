# Render server deployment

Repository: https://github.com/ideas9009/The-Records-Project
Firebase project: the-records-project-plus

## What this server does

The app shows its own Minecraft username/password login. Render checks passwords using scrypt salted hashes stored in server_credentials/{account UID}. No readable passwords are stored, returned, logged or bundled in the app. A single Firebase service-account identity is used by the server to access Firestore; client apps do not sign into Firebase.

Sessions use random 256-bit tokens. Only a SHA-256 digest is stored in server_sessions with a 12-hour expiry. The desktop keeps its token in session storage for the current app session. Logout revokes that token while preserving the account for future login. Every request loads the current role/status from Firestore. Rate limits are stored in Firestore so they survive Render restarts.

## Deploy in Render

1. Push this source to the repository above. In Render choose New > Web Service and connect that repository. Or create a Blueprint using render.yaml.
2. Use the repository root (do not set Root Directory to server). Runtime: Node. Region: Oregon. Build: npm ci --prefix server. Start: npm start --prefix server. Health check: /health. The Blueprint selects the free plan; Render may sleep while idle and requests can take longer after inactivity.
3. Set FIREBASE_PROJECT_ID to the-records-project-plus. Set GOOGLE_APPLICATION_CREDENTIALS to /etc/secrets/firebase-service-account.json. Set ALLOWED_ORIGINS to http://127.0.0.1:1420,http://localhost:1420,http://tauri.localhost,https://tauri.localhost. Add another exact origin only if needed for a known app preview.
4. Create a dedicated Google Cloud service account for Render in the-records-project-plus and grant Cloud Datastore User for Firestore access. Generate its JSON key yourself and put its contents directly into a Render Secret File named firebase-service-account.json. Do not put this file in Git, paste it in chat, or use the Firebase web configuration as a server credential.
5. Deploy the service. Startup checks Firestore access and fails if credentials are unavailable. Confirm /health returns status ok. The key and the source code are never sent to the desktop app.
6. In Firebase > Firestore > Rules, publish firestore.rules from this repository, which denies all direct client access. The Admin SDK bypasses those rules; permission checks are implemented and tested on the Render server. The previous anonymous rules are preserved only as firestore.anonymous-reference.rules and must not remain active once the server is used. Firebase Email/Password and Anonymous providers are not needed by this version.
7. Send the public HTTPS Render service URL back to Codex. Or run node scripts/set-api-url.mjs https://YOUR-SERVICE.onrender.com from the project root, then restart development or rebuild the desktop app. This writes the local VITE_API_URL and pins the exact origin in the desktop connection policy.

## First Operator account

Register Sumeitideas in the app, choosing a private password yourself. All registrations start as pending members. Find the new document in Firestore > users whose authType is records and whose username is Sumeitideas. Match its UID to account_names/sumeitideas. Change only role to operator and status to approved through the trusted console. The app refreshes account status within 30 seconds or on window focus. No public endpoint can promote itself to Operator.

This does not import or overwrite the previous anonymous account. That account's UID and its Firebase provider are separate. Existing towns/gallery records remain preserved. If they belong to the previous anonymous mayor UID, ownership must be deliberately reassigned to the new app account before uploading more images. Create test town adds only missing records.

## Development and checks

Install server dependencies with npm ci --prefix server. Set GOOGLE_APPLICATION_CREDENTIALS to a local path outside the repository, set FIREBASE_PROJECT_ID, and run npm start --prefix server. The frontend development proxy sends /api calls to 127.0.0.1:8787. Production requires the HTTPS VITE_API_URL configured above.

Run npm test --prefix server for backend tests, npm test for frontend tests and npm run build for the app build. Backend tests use an isolated in-memory store with the same service and HTTP code; live Firestore reads/writes must still be verified after deployment.

Old local JSON files, credential hashes and Flutter archives are not imported automatically. Static wallpapers are bundled assets; appearance settings stay on the device; uploaded gallery photos go through Render into Firestore. Original high-resolution wallpapers and local archives remain on this device; the repository includes the prepared images needed to build.

## Limits before a public launch

The current API exposes only the rebuilt workflows; other page actions remain unavailable. Lists are capped at 200 records and gallery updates poll every 30 seconds. Add pagination and more efficient image delivery as data grows. Sessions and rate-limit records have enforced expiry but need a scheduled cleanup policy to remove expired records physically. Recovery is administrator-assisted and Microsoft OAuth is deferred. Verify credentials, Operator bootstrap, direct-client deny rules and real read/write access before publishing.

## Verified deployment — 17 October 2026

- Render project: The Records Project, Development environment.
- Service: the-records-project-api, Oregon, free instance.
- Public API: https://the-records-project-api.onrender.com
- Render dashboard: https://dashboard.render.com/web/srv-db9kaqfbtjjs73c21q20
- Live health returns 200; protected endpoints return 401 without an app session.
- Server-only Firestore rules published; prior rules saved in the ignored local archive.
- Initial Sumeitideas app Operator created using the requested temporary development password. No old anonymous account was overwritten.
- Verified live registration, server session, Firestore town creation/read and logout revocation.
- App endpoint configured locally and its exact HTTPS origin added to the desktop connection policy.
