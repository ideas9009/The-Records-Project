# Isolated updater lab

This hidden Tauri application imports the production Rust updater module. The production Dart source is copied for local tests; only the API/download endpoints and public key differ. Test signing material and installers are ignored by Git. It has a separate app identifier, UpgradeCode, installation directory, and data directory. It contains no TRP account data or main-app UI.

Run `scripts/build-updater-lab.ps1 -Build 0 -GitHubCheck -DartPath <dart.exe>` from a Visual Studio developer shell to build the read-only GitHub probe. It refuses any action other than `check`.

For installation tests, build local build 0, install its MSI, then build local build 1 using the same script without `-GitHubCheck`. The local fixture MSI uses per-user installation to keep the test separate. Run `node scripts/serve-updater-lab.mjs`; it listens only on 127.0.0.1:18764. Never upload these fixture packages or keys to production.

The installed executable accepts `check 0 update`, `prepare 0 update`, `install 0 update`, or `install 1 reinstall`. Only the fixture build allows installation. On successful relaunch it checks its compiled build number. Results are written to `%LOCALAPPDATA%/com.therecordsproject.updaterlab/last-result.json`. Installer logs and result.json are in the most recent temporary `trp-update-*` folder. A fixture fault.json containing `{"interrupt":true}` breaks the MSI download deliberately; replace it with `{}` to restore normal service.

## Results — 20 October 2026

- Installed GitHub probe reproduced the original no-response bug: Dart rejected the verbatim Windows executable path prefix. After path normalization it returned the expected numeric-tag validation error for the existing v2.0.0 release.
- Installed local build 0 detected signed build 1 independently of MSI version and release title.
- Interrupted download and invalid signature both returned errors without installing.
- First installer handoff exposed mixed path separators rejected by msiexec (1619); native separators fixed it.
- Build 0 upgraded to build 1, Windows Installer returned success, the app relaunched and reported up to date.
- Same-build reinstall succeeded and relaunched into up to date.

The local per-user fixture does not validate elevation/UAC for the main per-machine MSI. The final production MSI still needs its normal installation smoke test. No GitHub release was changed or published by these tests.

Final rerun: refreshed the fixture helper from the current production source, rebuilt the lab MSI, and repeated build 0 to 1 upgrade and build 1 reinstall with successful automatic relaunch. Interrupted downloads, invalid signatures and a deliberately modified MSI were rejected. Fixed configuration writes to use UTF-8 without a BOM so the build script also works in Windows PowerShell 5. Fixtures were restored and the local feed stopped. See ../FINAL-TEST-REPORT.md.
