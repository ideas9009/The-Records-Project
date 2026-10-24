# Nostra · 2 | Phase 2

**Release:** Build 4 · MSI 1.4.2  
**Last updated:** 24 October 2026

Phase 2 continues the transition from Flutter to React. These notes cover Phase 2 only. Published Phase 1 notes are preserved in the Changelog.

## My Profile

- Replaced the placeholder page with a personal profile summary, a 3D Minecraft character, role badges and membership details.
- Added registered town memberships with shortcuts to town pages and a View public profile button.
- Added a Connected accounts section with Microsoft account linking for existing TRP members. Server activation and the initial live verification/linking test have been completed.
- Added a direct shortcut to Account settings for password management, plus a sign-out action.
- Discord linking and profile customization remain planned for future updates.
- Pending registrations retain their separate approval screen.

## About and Changelog

- Updated the current phase label to Phase 2.
- Started fresh Phase 2 release notes and archived the original notes for Phase 1 builds 2 and 3.
- Added a separate Changelog button in About. Browse versions and open a release to read its own notes.
- Included saved Phase 1 notes for offline browsing. The version list also checks GitHub for newly published releases.

## Account verification

- Minecraft API application approval has been received. Microsoft verification and linking have been enabled and tested with the owner’s account.

## Developer Tools

- Added an account-only Developer Tools section in Settings with safe previews of sign-in, manual registration, approval, Microsoft confirmation and connection screens.
- Added shortcuts to publishing forms, hidden pages and specific records. Real page actions retain their usual permissions.

## Sign in

- Simplified the sign-in heading, placed account creation and Microsoft sign-in side by side, and centered the version label.
- Improved spacing, keyboard focus and the main sign-in button, with a show/hide password control.

- Adapted Sign in to a left-side panel on desktop, with the logo beside the heading, secondary actions near the bottom, and a centered mobile layout.

## Registration

- Matched registration to the Sign in panel. Creating an account expands the panel to the right and guides users through EMC lookup, profile confirmation and password setup.
- Added a numbered progress rail, clearer step headings and a Back to profile action. The flow fits narrow screens and respects reduced-motion preferences.
- Developer Tools now supports entering the sample registration flow directly from its Sign in preview.

- Registration pending now continues the same panel layout, with a compact profile summary, review progress and the existing EMC recheck and sign-out controls.

## Connecting

- Replaced the connection card with a simple loading circle, current connection activity and a progress bar driven by session and account-loading milestones. Connection failures retain a retry action.

- Sign-in, registration and connection screens now cycle wallpapers every three seconds with a fade. The slideshow uses smaller background images, pauses when hidden, respects reduced motion and Potato Mode, and leaves the saved app wallpaper unchanged.

## Microsoft sign-in window

- Added a dedicated desktop Microsoft sign-in window with persistent browser data to remember Microsoft accounts between app launches.
- Added a saved choice to use the default browser, plus an option to switch to it during sign-in. Verification and profile confirmation continue through the existing server flow.
- The native window closes on verification or cancellation while retaining Microsoft cookies. The packaged Windows build includes this sign-in window.

## EarthMC towns

- Added View towns on EarthMC to Town Registry, matching the public people directory.
- Browse public towns with search, nation filters, a Byzantium shortcut, pagination and page capture.
- Open town information for its mayor, residents, nation, claims, bank balance, spawn and detailed EarthMC records. Resident and mayor buttons open their public player profiles.
- EarthMC browsing remains separate from registered TRP towns and test data.

- Organized EarthMC town information into Overview, Residents, Trusted players, Apartments/Quarters, Claimed plots and More details.
- Added searchable face-and-name player buttons, named apartment detail views with owners, boundaries and public records, and readable multi-world plot locations.
- Ordinary plot names and individual plot owners are not exposed by EarthMC’s public API; the plot view clearly identifies the available location information.

- Replaced screenshot actions on selected EarthMC town and player pages with plain, paginated PDF reports containing the full loaded record and available Minecraft faces. Town reports omit individual apartments/quarters and include every town section regardless of which tab is open.

- Added an Online players filter to People on EarthMC, combining with username search and nation filters.
- Online players now have a green status dot on their Minecraft faces throughout the app. Status uses EarthMC's public online list, refreshes automatically, and clears when unavailable or stale.

- Connection failures now explain that the server may be restarting and ask users to wait a few minutes before contacting @sumeitideas on Discord.

## Account access

- Added reversible account disabling and enabling in Administration, following existing moderation permissions and protecting self-access and Operator accounts.
- Disabling invalidates sessions, blocks password and Microsoft access and prevents new registration with the disabled Minecraft identity, including after a Minecraft username change.
- Phase 1 receives an account-not-found response. Its legacy Restore action cannot enable a disabled account. The new Phase 2 Administration action restores the previous status without approving pending registrations.

## Background syncing

- Reduced automatic background syncing to every 10 minutes, paused hidden/offline requests, and removed repeated focus refreshes. Older 1/5-minute SmartSync settings now use 10 minutes. Hiring chat includes a manual Refresh messages button.

## Image storage

- Town covers now fit within 1280 × 720 pixels, keep their proportions, and are compressed to a smaller storage budget without enlarging small images.
- Town gallery uploads retain their original pixel dimensions. Images that cannot fit the existing storage limit are rejected rather than resized.
- Mayors can replace or permanently remove individual gallery images. Replacement overwrites the same record, removal deletes it, and stale edits cannot erase newer images.
- Removing a custom town cover restores the bundled default. Replaced cover, news thumbnail and task-proof data is overwritten rather than kept as unused upload copies.

- Lightened the sidebar wordmark to Telegraf Regular and marked Companies and Expansion Packs as coming soon in future updates.

- Added solid rounded page headers using each section's sidebar colours, with dark buttons and light button labels/icons. Sign-in and registration screens retain their existing styling.


## Window scrolling

- Prevented scrolling past the app viewport and exposing empty space beneath the wallpaper in WebView2. Content, dialogs, and authentication screens retain their own scrolling.

- Kept page title banners, search fields, and filters visible during scrolling. Tiles now soften at the top and bottom boundaries without blurring the wallpaper; screenshots/PDF content remain unmasked.

## UI performance

- Limited glass blur and page transition effects to visible and nearby tiles, including long EarthMC directories.
- Batched scroll measurements before visual updates and stopped rebuilding scroll observers for face images and text changes.
- Kept page titles, search and filters pinned beneath the expanded sidebar, with soft tile edges while scrolling.

- Fixed the Task Board and Shop Search page sliders jumping back to the previous page before completing a click or drag navigation.

- Updated both page sliders with an animated solid selection pill and clipped label colours that follow the pill during clicks and dragging.

- Fixed sidebar wheel scrolling over navigation buttons while retaining window overscroll protection.

- Tidied Administration with grouped section navigation, consistent search controls, clearer account status badges and player faces, and cleaner review panels.
