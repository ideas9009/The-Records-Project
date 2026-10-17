# Nostra · 2 | Beta 1

**Status:** Unreleased development draft  
**Last updated:** 17 October 2026

These are fresh release notes for Nostra-2. Notes from previous versions are not carried forward. This file will be updated as features are completed.

## Completed so far

### New foundation

- Rebuilt the Windows app foundation with React, TypeScript, Tauri and Rust.
- Archived the previous feature pages and supporting source to make room for a fresh rebuild.
- Kept the shared visual shell, fonts and bundled wallpaper collection.
- Added the supplied book logo and the new version label: **Nostra · 2 | Beta 1**.

### Redesigned sidebar

- Added a translucent sidebar that expands on hover and retracts when the pointer leaves.
- Made expansion overlap the current page so the page and map keep their width.
- Added colored pill buttons and locally bundled Google Material Symbols.
- Inverted the selected button's fill and icon/text colors.
- Added button extensions beyond the sidebar edge.
- Hidden the scrollbar while preserving scrolling, with gradual fades at the list edges.
- Updated hover targeting during scrolling so it follows the button beneath the pointer.
- Added vertical **Byzantium** text in the collapsed sidebar.
- Refined logo sizing, image padding, header spacing and icon alignment.
- Removed Wallet, Discord Chat, Live EarthMC, Desktop Widgets, Mayor Toolkit and Analytics from navigation.
- Removed the top development-status strip and moved Notifications above the profile button.

### EarthMC Map

- Added an embedded EarthMC map at https://earthmc.net/map.
- Made the map fill its page without placeholder headings or cards.
- Verified that the map loads in the browser preview.

### Settings and About

- Added an Appearance section with the bundled 40-image wallpaper gallery and a no-wallpaper option.
- Added an interface scale slider from 20% to 180% in 10% increments, applied immediately and saved across restarts.
- Added Potato Mode: solid grey surfaces, no backdrop blur or tint effects, reduced animation, and wallpaper hidden while preserving the selection.
- Added Windows behaviour controls for launching with Windows, starting minimized and closing to the tray. The browser preview explains that these require the desktop app.
- Added a separate About page with version information, fresh release notes and credits.
- Placed About beside Notifications at the bottom of the expanded sidebar; both hide when it retracts.

### Town Registry

- Added searchable town cards showing Records Project residents, EarthMC residents and claimed chunks.
- Compact cards open a dedicated town details page showing the mayor and registered residents, with a return button to the registry.
- Added compact statistics on the left and a right-side town image with a fading edge; the test town uses a bundled wallpaper.
- Included one clearly marked local test town with sample counts. Live EarthMC/Firebase town integration is not active yet.

- Renamed the residents section to “Residents in The Records Project” and removed repeated nation labels.
- Added a town gallery with mayor image selection, thumbnails and larger previews. Images are compressed and saved locally; shared Firebase storage is pending.

### Local sign-in and registration

- Added local Minecraft username/password accounts with salted password hashes and sign-out.
- New registrations have limited access until approved by an Operator, Admin or Leader.
- Pending profiles display registration progress; Administration lists requests for approval.
- Replaced Nation Affairs with News immediately below Overview.
- Local development access controls are not a production security boundary; server-side authorization is required before shared deployment.

### Firebase connection

- Selected the-records-project-plus using the supplied web configuration.
- Replaced active local login with Firebase Authentication and UID-based Firestore profiles.
- Connected town summaries, restricted details, gallery images, approval requests and appearance preferences to Firestore.
- Added pending-member and reviewer rules; publishing and live verification remain required.
- Retained local JSON as backup only, with no automatic upload or fallback.
- Updated the registration note about possible Discord confirmation; Discord delivery remains disconnected.

## Development status

- EarthMC Map, Town Registry, Settings and About are implemented in the fresh rebuild; the other main sections remain placeholders.
- Firebase username/password sign-in is active in code. Initial cloud account creation and trusted Operator setup require the project owner.
- Firebase is the active backend in code; rules deployment and live authenticated verification are pending.
- Notifications currently opens a placeholder panel; notification delivery is not implemented.
- This is not a published release. Final installer, updater and release acceptance testing remain ahead.
### Sign-in paused

- Restored immediate access to the Sumeitideas UI preview.
- Firebase account screens and protected cloud operations are paused; configured project and rules are preserved.
- Preview towns use the bundled test fixture, appearance changes save on this device, and gallery uploads/registration approvals remain paused.

### Firestore without email sign-in

- Restored Firestore as the active backend, using persistent anonymous Firebase sessions with no email/password screen.
- New devices remain pending until a trusted reviewer approves them; the initial development Operator is assigned through the Firebase console.
- Updated Firestore rules and setup steps for Anonymous rather than Email/Password. Live verification requires provider activation and rules publication.

- Added Log out at the top right of My Profile, with an anonymous-account confirmation and a logged-out screen. Logout suppresses automatic anonymous reconnection until Continue is selected.

### Render-backed app accounts

- Added a Render-ready Node server and single server-side Firebase Admin connection.
- Restored app username/password registration and login, with salted scrypt password hashes in a server-private Firestore collection.
- Added revocable sessions, persistent rate limits and server-enforced permissions for approvals, towns, gallery uploads and preferences.
- Removed Firebase client authentication from the active app and prepared direct-client-deny Firestore rules.
- Added deployment instructions for ideas9009/The-Records-Project; live deployment still requires the Render service and private Firebase credential.

- Deployed the Render API in Oregon and connected the app to its HTTPS endpoint.
- Published server-only Firestore rules and verified live account, town and session operations.

- Renamed Job Board to Task Board in the sidebar and page heading.

- Renamed Shop Showcase to Shop Search and Companies & Orders to Companies.

- Made wallpaper, interface scale and Potato Mode device-local. Sign-in, sign-out and account refresh no longer overwrite appearance settings. Disabled the old cloud preference endpoint; existing cloud preference records are preserved but ignored.
