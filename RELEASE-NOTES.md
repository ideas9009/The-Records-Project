# Nostra-2

**Release:** Nostra-2
**Last updated:** 3 November 2026

## Companies

- Added a Register your company button that sends a private in-app notification to Sumeitideas. Repeated clicks do not create duplicate requests.
- Company profiles and registration forms remain planned.

## Feedback

- About includes a suggestion and bug-report form. Reports go privately to Sumeitideas’s notifications with the sender and app version.

## Notifications

- Added a saved notifications inbox, loaded when opened, with a manual Refresh button.
- Published Phase 2 release notes are preserved in the Changelog.

## SmartSync and sign-in

- The website shows an app-only SmartSync message; approved Operators can open its controls for testing. Normal website accounts do not run SmartSync caching.
- App sign-ins are remembered across restarts and use persistent server sessions. Website sessions remain temporary. Signing out removes the session; account disabling and revocation remain enforced.

- Sign-in and loading screens show rotating discovery tips. The connection screen uses a custom loading circle without progress bars or service-status text.

## Windows window controls

- Replaced the main Windows titlebar with custom React window controls, update checking, notifications and page refresh.
- Ctrl-clicking Refresh reloads the app and requests a fresh data sync after sign-in is restored. Normal refresh reloads the current page, with unsaved-change prompts retained.
- Existing page refresh buttons remain visible on the website.

## Desktop Widgets expansion

- Added Desktop Widgets beta as an included pack, enabled or disabled in Expansion Packs. No separate executable is downloaded in this version.
- Added VoteParty, Nation Balance, and online nation-player widgets with Minecraft faces.
- Widgets support desktop-only or always-on-top overlay mode, 1×1 through 3×3 sizing in half-unit steps, optional padded snapping, saved positions and startup restoration.
- Expansion Packs is hidden and blocked on the website, including for Operators.
- Enabled widgets keep TRP running in the tray when the main window closes.

- Widget customization now lives in Settings → Desktop Widgets. Sizes are adjusted only by dragging.
- Typography, Minecraft faces and controls scale together with the shared widget size multiplier.
- Added shared locking, blur and tint controls, per-widget placement, and following a selected app window’s corner.

- Fixed native titlebars and disappearing desktop widgets by applying window changes together on the UI thread; mouse interaction restores correctly after locking and mode changes.

- Rebuilt widget tiles with consistent spacing, SVG icons, compact edit controls and responsive numbers. Resizing is continuous and snaps to the half-unit grid on release.
- Widgets use a separate frontend entry, skip wallpaper setup and duplicate player-presence polling, and stop automatic scrolling while hidden or when the list fits.
- Widget windows suppress native frames throughout their message lifecycle, including delayed theme and style changes. Placement settings now combine desktop, always-on-top and following an app window into one choice.

## Town Suggestions beta

- Added mayor-only Suggestions with a border chunk map, expansion direction comparison, potential adjacent overclaim information, and a 16-gold-per-chunk calculator.
- The page warns that beta suggestions are not 100% accurate and can make mistakes. Unknown ownership is never treated as wilderness; overclaim opportunities require in-game verification.
- Scans run on demand, share a five-minute cache, and check up to 4,096 surrounding chunks within ten chunks of the town. API permissions are checked before scans and cached results are returned.

- Suggestions maps now survey ten surrounding chunks in every direction, label nearby towns, fit the surveyed area automatically, and keep selected claim routes connected. Large scans clearly report coverage limits.

## Quick Search and Rhōmaíōn AI beta

- Alt+Q opens Quick Search for public EarthMC players, towns and nations, with keyboard selection and profile summaries.
- Alt+Shift+Q opens Quick Rhōmaíōn with saved local conversations and the latest exchange above the prompt bar. The prompt preloads after sign-in and stays ready between openings.
- Rhōmaíōn can explain public app pages, open permitted pages, search EarthMC, plan town expansion routes and prepare unsaved news, task, material, shop and bulk drafts.
- AI permissions follow the signed-in user and are capped at Admin for Operators. Town changes require explicit approval; drafts require review and saving in the normal editor.
- Profile summaries appear beside the conversation. Player profiles are checked against the public API, with clear unavailable states for missing or opted-out records.
- Animated activity indicators show progress in both chat modes. Chats can be saved locally, exported or cleared in Settings.

## Update experience

- Added a glowing update reminder and a floating panel beside the sidebar, with public release names, release notes, download sizes, progress and retry controls.
- Closing the panel keeps the reminder and download progress. Installation still requires choosing Install and restart, with unsaved-work protection.
- Developer Tools includes app-only reminder and prompt previews with simulated progress. Previews cannot download or install updates.

## Known beta limitations

- Desktop widget blur edges and desktop placement may render differently across Windows versions. Blur Off avoids the known blur-corner artifacts.
- AI advice and town expansion suggestions can be inaccurate; verify claims, costs and eligibility in Minecraft before acting.
