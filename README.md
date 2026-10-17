# The Records Project — Nostra · 2

Windows desktop app built with React, TypeScript, Tauri and Rust. The Records Project uses its own username/password login backed by a Render Node server and Firestore. Firebase Authentication is not used by the active app.

## Server and deployment

See [RENDER-SETUP.md](RENDER-SETUP.md). The repository includes render.yaml for a Frankfurt web service and server/package-lock.json for reproducible installs. Firebase credentials belong in Render Secret Files, never in the app or repository.

## Local development

Install frontend dependencies with npm ci. Configure server credentials privately, install server dependencies with npm ci --prefix server, and start it with npm start --prefix server. Run npm run dev for the browser preview or npm run desktop for Windows. The frontend proxy sends /api requests to the local server on port 8787.

Configure a deployed server with node scripts/set-api-url.mjs https://YOUR-SERVICE.onrender.com, then restart/rebuild.

## Checks

- npm test
- npm test --prefix server
- npm run build

Town Registry, Settings, About, EarthMC Map, app login/registration and the approval queue are implemented; other sections remain placeholders. New members have restricted access until approved by an Operator, Admin or Leader. Passwords are salted scrypt hashes and sessions are revocable.

Local archives and high-resolution wallpaper originals remain on the development device. Prepared wallpapers are included so a fresh checkout can build. Previous local/anonymous accounts are not automatically migrated. See RELEASE-NOTES.md and REBUILD-PAGES.md for rebuild status.
