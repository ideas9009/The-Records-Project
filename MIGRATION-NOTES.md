# Nostra-2 compatibility build

This Windows-only React/TypeScript + Tauri/Rust application lives in `The Records Project`. The original Flutter project remains in `TheRecordsProject-main`.

The app now opens a fresh local **Sumeitideas** account with operator access and zero balance. Records are saved to JSON on this computer. Firebase is disconnected and untouched; no cloud export was made. See [LOCAL-DATABASE.md](LOCAL-DATABASE.md).

## Converted workflows

| Area | Available in this build |
| --- | --- |
| Overview | Live registry counts, bulletin, land goal, open jobs, EarthMC nation balance |
| Towns | Registry, details, registration, editing, rename with linked records, mayorship, councillors, gallery, town restrictions and deletion |
| Citizens | Directory, profiles, avatar/banner uploads, galleries, friend requests and connections |
| Jobs | Publish/edit, worker capacity, applications and approval, proof uploads, work approval, payment confirmation, rewards and archive |
| Materials | Requests, fulfillment, delivery and payment acknowledgments |
| Shops | Existing listings and types, search, listing creation, editing and deletion |
| Companies | Existing companies, ownership, branding, products, storage compartments, reservations and company links |
| Orders | Gold/Emerald checkout, delivery information, existing order states, escrow settlement/refund and order conversation |
| Wallet | Balance, transfers, transaction history, expiring shop/job upgrades and consulting requests |
| Nation affairs | Diplomacy, temporary/permanent hunters, live online tracker, war records and land claims |
| Mayor toolkit | Town bulletins, taxes and plots |
| Analytics | Job and trust distributions, land distribution, citizen rankings |
| Discord | Local channel chat, replies, editing, deletion, mute and channel-lock behavior; Discord syncing paused |
| Administration | Approval, roles, town assignment, balances, bans/expiry, kicks, progress reset, deletion, invitations, settings and audit log |
| Notifications | Existing account notifications, read/clear controls; optional Windows vote-party alerts |
| Map and live data | Embedded EarthMC map, separate windows, live town/citizen lists and vote-party count |
| Desktop tools | Tray, background-on-close, Windows startup/minimized startup; statistics/nation/friends/vote widgets with saved positions, pinning and click-through controls |
| Customization | Light/dark/neon themes, accent, scale, wallpaper, navigation arrangement, hidden pages, dashboard choices and configurable/importable shortcuts |
| Onboarding help | Getting-started tutorial and the existing one-time 100-Emerald reward |
| Brand | Supplied new logo, packaged Windows icons and app branding |

## Compatibility decisions

- Legacy collection names and workflow fields are retained inside the JSON document map.
- Job states remain `applied`, `working`, `proof_uploaded`, `approved_pending_payment`, and `completed_archived`.
- Company prices are Gold. Emerald checkout uses the existing **100 Emeralds per Gold** conversion.
- Invite, ban and hunter expiry values are stored as ISO dates.
- A missing local database is initialized from the fresh seed. Existing files are never reset by a read.
- Money movement, rewards, reservations and related town changes use transactions. Town renames above the atomic write limit are refused instead of partially migrating.
- Chat retains the old message fields but is local only. The separate Discord bot is not connected to the JSON database.
- Removed image references do not delete Cloudinary assets. The desktop build contains no Cloudinary administrative secret.
- Published releases open for review; the old Flutter updater cannot silently replace this executable.
- The package requires Windows WebView2. The installer can download its bootstrapper if needed.

## Intentional omissions and differences

- Login, registration, Microsoft verification and future nation eligibility are deferred as requested. This build is private and uses one fixed account. Online authentication remains deferred; the local file belongs to the Windows user.
- AI is excluded as agreed.
- There are no macOS, Linux or mobile builds.
- The interface is redesigned. Legacy Flutter visual layouts and binary/custom DLC are not executable in Tauri. The bundled map, sidebar, dashboard, keyboard, neon and desktop tools have React/Rust equivalents.
- Desktop widgets are separate Windows windows, rather than the legacy WPF wallpaper-overlay engine. Exact legacy snap-to-grid/text-overlay layouts are not reproduced.
- The existing French dictionary is retained for navigation and shared UI labels; newly written help and some controls are still English.
- Discord account linking, password changes and recovery remain with the deferred authentication work.

## Verification

- TypeScript checking and optimized frontend build passed.
- **65 automated checks passed**: pure workflow checks, screen rendering with legacy-shaped fixtures, and isolated workflow and local database scenarios.
- Adapter checks cover repeat reward protection, escrow refund protection, catalogue pricing, town renaming, mayorship, town bans, consulting, invite expiry, tutorial reward and hunter date compatibility.
- Rust checks passed: endpoint allowlist plus four local database tests for persistence, backups, conflicts and invalid/corrupt file preservation. The live network test was not repeated for this change.
- The separate read-only Rust EarthMC test successfully retrieved Byzantium using verified HTTPS with rustls.
- npm dependency audit reported **zero known vulnerabilities** after dependency updates.
- The local preview API returned schema version 1, revision 0 and only users/Sumeitideas. Historical Firebase preview results do not describe this fresh database.
- No production purchases, messages, account edits, startup-registry changes or notification tests were performed.

Final hands-on UI verification is incomplete: browser automation rejected reopening the local preview, and native window capture timed out. Builds and isolated tests do not replace a full interactive acceptance pass. In particular, review the new widgets, image uploads, notification delivery and Windows startup behavior on the installed build.

The announcement's startup-time and 30–90 MB memory targets have not been benchmarked. Executable/installer sizes do not include the shared WebView2 runtime or development dependencies.
## Legacy appearance restoration
The default UI now follows the Flutter dark theme: black canvas, 20px rounded window panels, blurred translucent cards, colored pill navigation, and colored 30px-style dashboard tiles. The dashboard again includes registry/live statistics, king, capital, balance, diplomacy and VoteParty. Settings offers the complete 40-image collection from the original project’s wallpapers folder and a no-wallpaper option. Custom image uploads and URL entry are removed. The selected gallery image is restored on launch. Existing theme preferences migrate to the restored dark default once; later theme choices persist.

## Wallpaper collection
The source images are preserved in the root `wallpapers/` folder. `npm run prepare:wallpapers` generates full-resolution WebP copies, small gallery thumbnails and a catalog; it runs automatically before development and production builds. All 40 originals are included. To update the collection, update that folder and rebuild. Firebase is not used to upload or store wallpapers. Existing selections from the earlier three-image gallery migrate automatically; the removed custom-image mode resets to no wallpaper.
