# Nostra-2 pages to rebuild

The active app includes local sign-in and approval-based registration, Town Registry, Settings, About and the EarthMC Map. Other sections remain placeholders. Local account updates are watched while signed in. Firebase and Microsoft OAuth are not active.

## Main app sections

| Page | Work to design and rebuild |
| --- | --- |
| Overview | Dashboard, summary cards, news and announcement previews |
| Town registry | Searchable compact cards and a dedicated town details page implemented with one test record; live data, onboarding and management remain |
| Citizens | Citizen directory and public profiles |
| Job board | Listings, job details, applications, proof, approval and payment flow |
| Shop showcase | Listings, shop details and management |
| Companies | Directory, company details, ownership, products and storage |
| Orders | Buyer/seller lists, checkout, order details, status and conversation; previously inside Companies |
| Material requests | Request list, creation, fulfillment and delivery confirmation; previously inside Jobs |
| Bulk requests | New page; precise meaning and workflow still need definition |
| News | New dedicated list, article detail and publishing controls |
| Announcements | Dedicated list, announcement detail and publishing controls |
| My profile | Registration progress and sign-out implemented; public profile details remain |
| Administration | Local registration approval queue implemented for Operators, Admins and Leaders; backend rules and role management remain |
| Settings | Implemented: wallpaper gallery, interface scale, Potato Mode and Windows behaviour |
| EarthMC map | Implemented: full-page embed of https://earthmc.net/map |
| Expansion packs | Review for removal; currently a placeholder only |

## Removed from the rebuild

Wallet, Discord Chat, Live EarthMC, Desktop Widgets, Mayor Toolkit and Analytics were removed at the user’s request. Their previous implementations remain in the archive.

About is a separate implemented page beside Notifications in the expanded sidebar. Updater delivery remains deferred.

## Account and supporting screens

- Local username/password sign-in and pending registration implemented. Microsoft verification remains deferred.
- Microsoft/Minecraft identity confirmation and EarthMC information review.
- Pending manual verification, mayor-required waiting state, and nation eligibility errors.
- Password setup and administrator-assisted recovery.
- Notifications list and read state.
- Getting-started help, if retained.
- Detail forms, confirmation dialogs and empty/error/loading states for each retained workflow.

## Build order proposal

1. Agree on the retained pages, new navigation and data model.
2. Rebuild registration, permissions and administration with Firebase.
3. Add towns/citizens, news/announcements, then the selected economy workflows.
4. Add the remaining approved integrations, settings, installer and updater.
5. Complete acceptance testing before publishing.

## Preserved visual foundation

Branding, fonts, dark glass surfaces, rounded panels, colored navigation pills, sidebar, top bar, footer, existing theme/scale preferences, and the bundled 40-image wallpaper collection are retained. The previous Settings page is archived, so its wallpaper selector will be rebuilt later; saved wallpaper selection still restores at startup.

## Archive

Previous source and tests: archive/pre-rebuild-2026-10-16/. The archive is excluded from the active bundle and test discovery. Existing local JSON files and Firebase configuration are preserved; this reset does not delete database records. Native Windows infrastructure remains available for later work.
