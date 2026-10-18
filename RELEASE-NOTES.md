# Nostra · 2 | Phase 1

**Status:** Unreleased development draft  
**Last updated:** 18 October 2026

Phase 1 of the planned three-phase transition from Flutter to React. These notes cover the current rebuild; release notes from previous versions are not carried forward.

## Foundation and navigation

- Rebuilt the Windows app with React, TypeScript, Tauri and Rust. Archived the previous feature pages for the fresh rebuild.
- Added the supplied book logo and the version label **Nostra · 2 | Phase 1** across the footer, sign-in and About pages.
- Redesigned the translucent sidebar to expand on hover and overlap the page without resizing its content.
- Added colored pill buttons, inverted selection colors, locally bundled Material Symbols, scrolling fades and improved icon alignment.
- Added vertical Byzantium text when collapsed. Notifications and About appear at the bottom when expanded.
- Removed Wallet, Discord Chat, Live EarthMC, Desktop Widgets, Mayor Toolkit and Analytics from navigation.
- Renamed Nation Affairs to News, Job Board to Task Board, Shop Showcase to Shop Search, and Companies & Orders to Companies.

## Accounts and security

- Added TRP Minecraft username/password registration, sign-in and sign-out through the Render API in Oregon.
- Store account data in Firestore through the server. Passwords use salted scrypt hashes in a private collection; the app does not receive password hashes or Firebase Admin credentials.
- Added revocable sessions, rate limits and server-enforced permissions. Direct Firestore client access is denied.
- New manual registrations have limited access until approved. My Profile displays registration progress and assigned roles.
- Added Settings > Account with password changes requiring the current password and confirmation of the new password. A successful change signs out other sessions while keeping the current session active.
- Added Microsoft account linking in Account settings. Discord linking is marked Coming soon.
- Added a My Profile notice that profile customization will arrive in a future phase.

## Microsoft account verification

- Prepared Microsoft registration, optional sign-in and explicit linking for existing TRP accounts.
- Prepared Minecraft Java ownership checks, EarthMC membership confirmation, password setup and verified town linking.
- Confirmation includes the Minecraft username, avatar, EarthMC ranks, town, nation and available balances. Unregistered-town residents receive a notice and can be linked when their verified mayor registers the town.
- Added the optional Recommended: Link with Microsoft prompt for existing unlinked accounts, shown when the provider becomes available.
- Submitted the Minecraft AppID review request. Microsoft registration, sign-in and linking remain disabled pending approval; live provider verification is still outstanding.

## Administration and roles

- Added multiple simultaneous roles: Operator, Leader, Prime Minister, Admin, Minister, Deputy, Mayor, Army and Citizen.
- Prime Minister has Leader permissions. Army has Citizen-level access without additional permissions.
- Added registration reviews, user moderation, role management and an activity log.
- Only Operator, Leader and Prime Minister can manage roles. Admins cannot edit roles, including higher-ranked or multi-role accounts. Only an Operator can change Operator access.
- Added server checks against current permissions and tests for forged role-change requests and revoked management access.
- Added an EarthMC rank-review queue for ambiguous roles. Displaying an EarthMC rank on a public profile does not grant TRP permissions.

## Town Registry

- Added searchable compact town cards with TRP resident counts, EarthMC resident counts and claimed chunks.
- Town cards open dedicated details pages with a mayor, resident list and full-width layout.
- Added a town image on the right of each card with a fading edge and compact statistics on the left.
- Added Register Town for Operator, Leader, Prime Minister, Admin and Minister, with Town Name and a registered-user mayor selector.
- Added mayor-managed galleries with compressed images, thumbnails and larger previews, stored through the API in Firestore.
- Retained a clearly marked test town with sample statistics. Town statistics are not yet automatically synchronized from EarthMC.

## Citizens

- Added a searchable directory, role filters, multi-role badges, public profiles and registered-town affiliations.
- Public profiles show approved TRP members without exposing credentials or administrative account metadata.
- Added a separate EarthMC Profile section, using the registered TRP username with EarthMC API v4.
- Display available town, nation, EarthMC ranks, title, balance, online status, join dates and last-online time.
- EarthMC data loads independently from the TRP profile, with loading feedback, a refresh button and an updated time. Short server caching reduces repeated requests.
- Handle missing or private EarthMC profiles and service failures without blocking TRP profile viewing. Username lookup does not verify ownership or change TRP roles.

- Added View people on EarthMC: a separate public player directory with username search, nation filters, a Byzantium shortcut and paginated results.
- EarthMC player pages display every field returned by the public API, including ranks, timestamps, friends and permissions, independently of TRP records. API opt-outs are respected.

- Replaced initials with Minecraft face avatars in citizen cards, EarthMC player lists and details, My Profile and the sidebar. Images load on demand with an initials fallback when unavailable.

- Face icons now show the full square face without rounded cropping. Opened TRP and EarthMC profiles, and My Profile, display a 3D character render.

## News and meetings

- Added a searchable full-width feed and dedicated article pages.
- Approved Operator, Leader, Prime Minister, Admin, Minister and Deputy accounts can publish news.
- Added optional thumbnails and subtitles, standard/Discord-style Markdown, editing and complete article or meeting previews.
- Added private drafts, scheduled publication using the server clock and recoverable archiving. Drafts and scheduled news are restricted to publishers.
- Added a server-enforced 10-second Undo after immediate publication, returning the post to a draft.
- Added meeting posts with editable Google Meet links, Join Meeting and an icon-only copy button.
- Added confirmations that expand from the initiating button for discarding changes and logging out.

## Settings and appearance

- Added a bundled 40-image wallpaper gallery and a no-wallpaper option.
- Wallpaper, interface scale and Potato Mode are saved on the device and persist across sign-in and sign-out.
- Added an interface-scale slider from 20% to 180% in 10% increments, with keyboard controls and Reset. Dragging applies the scale on release.
- Fixed shell dimensions and responsive layouts at supported scales, including the footer and confirmation overlays.
- Added Potato Mode with solid grey surfaces and reduced visual effects while preserving wallpaper selection.
- Added Windows controls for launch at sign-in, start minimized and close to tray. These require the desktop app.
- Added About with version information, these release notes and credits.

## SmartSync - Beta

- Added optional device-local caching, off by default, for Town Registry, published News, Citizens and supported visited details.
- Saved content appears while the app refreshes it in the background. Private account, authentication, administration, draft and scheduled-news requests are excluded.
- Added frequently used page selection, 1/5/15/30-minute intervals, Sync now, sync status, storage usage and Clear saved data.
- Background syncing pauses while hidden and resumes when visible or reconnected.
- Separated caches by server, account and permission scope, with a 50 MB limit and 24-hour expiry. Disabling SmartSync clears saved data.
- Writes and sign-in require a connection. Offline viewing in an already verified session pauses after 15 minutes without account verification.

## EarthMC Map and loading feedback

- Embedded the EarthMC map at https://earthmc.net/map to fill its page.
- Added loading feedback for server requests, navigation, asynchronous actions, the map and Windows preferences.
- Aligned sidebar loading indicators and standardized data-page loading placement.

## Still in development

- Overview, Task Board, Shop Search, Companies and Expansion Packs remain to be rebuilt.
- Microsoft integration awaits Minecraft API approval and end-to-end provider testing.
- Discord linking, Discord confirmation delivery and notification delivery are not implemented.
- Profile customization is planned for a future phase.
- Final Windows installer, update delivery and release acceptance testing remain ahead. This is not a published release.
