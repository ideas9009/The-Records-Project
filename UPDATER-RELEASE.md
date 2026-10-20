# Windows MSI releases

Nostra-1 users uninstall the Flutter app and install Nostra-2 manually. No legacy migration, folder move or registry rename is performed.

## Build

Use a Visual Studio developer shell. With the Dart SDK on PATH run `npm run package:msi`, or pass `-DartPath` directly to `scripts/build-msi.ps1`. The helper uses Dart/Dio for downloading, compiled as a self-contained EXE resource; the distributable installer is an MSI.

The public verification key is in `updater/lib/public_key.dart`. The matching private Ed25519 signing key was generated outside the repository under `%LOCALAPPDATA%/TheRecordsProjectReleaseKeys/update-private.pem`. Back it up securely before distributing this first build. Do not commit or upload that private file. `TRP_UPDATE_KEY_DIR` can specify another private key directory. CI may supply `TRP_UPDATE_PRIVATE_KEY` as a secret PEM value.

To create a key for a completely new product only, use `node scripts/update-release.mjs --init`. Never replace the key after release: installed clients trust the current public key.

## Publish (manual, after installer testing)

1. Keep `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` versions aligned. Use increasing Windows MSI versions, starting at 1.4.0. These do not determine update availability. Increase APP_BUILD in src/lib/app-build.ts for every published update; the next production release is build 2.
2. Build the MSI and signed metadata with the script. Output is in `src-tauri/target/release/bundle/msi/`.
3. Create a stable release tagged with the exact numeric React build number (e.g. `2`) in `ideas9009/The-Records-Project` with exactly these assets: the generated x64 English MSI, `update-windows-x86_64.json`, and `update-windows-x86_64.json.sig`.
4. Upload all assets before publishing the release. Do not rename the MSI after signing the metadata. Incomplete or unsigned releases are rejected.

The JSON signature authenticates the build number, exact MSI URL, byte count and SHA-256 digest. This is updater verification, separate from Windows Authenticode signing or SmartScreen reputation. The downloader does not strip zone information or change Defender settings. No prompt-free behaviour is guaranteed.

## Behaviour

The Windows app checks on launch, on the online event and every six hours while online. An available update replaces the sidebar branding; click it to expand details and download progress. Downloading does not close the app. Install and restart is a separate user action and honours form navigation guards. The helper re-verifies the MSI, waits for the app process to exit, invokes Windows Installer with a visible passive progress UI, and relaunches the installed executable. Failed installs reopen the previous app with an error. Windows may request administrator approval. Logs are retained in the temporary `trp-update-*` directory; the MSI is removed only on success.

About offers Check for updates and Reinstall latest release. Both use only the latest stable GitHub release. Numeric tags are compared with the React build number, independently of release titles and MSI versions. Reinstall accepts the same or a newer build and refuses an older build. Local data directories are not removed. The dev website has a simulated sidebar-prompt preview that never downloads or installs files; it is excluded from production builds.

On 20 October 2026 the isolated per-user updater lab passed build 0 to build 1 upgrade, restart, same-build reinstall, interrupted-download rejection, and invalid-signature rejection. See updater-lab/README.md. The production per-machine MSI still needs an installation smoke test, including elevation and the intended install path, before general release. Nothing was published automatically.

The prepared production assets are in windows-build/build-2/. Upload all three unchanged to tag `2`; the release title can be `Nostra-2-Phase-1`. The previous broken updater needs a manual MSI installation to receive these fixes.

Final verification reran the full website/server/Dart/native suites, rebuilt the production MSI, verified all copied release assets, and passed a fresh isolated upgrade/reinstall/relaunch plus interrupted, invalid-signature and corrupt-MSI rejection. See FINAL-TEST-REPORT.md for the exact results and remaining release checks.

## Publish with the Windows batch file

Double-click `Publish-Release.bat` in the project folder. Enter the numeric build number and exact release title when prompted, then confirm publication. The publisher uses the already-built MSI from `windows-build/build-<number>/`; it does not build on GitHub or invent a new build number for an old MSI.

Before the next update, increase `APP_BUILD`, use an increasing MSI version in the package/Tauri configuration, build and sign the new MSI, and copy all three release files into the matching build folder. The publisher rejects mismatched build numbers, invalid signatures and changed MSI files. The release title is only a display name and can remain `Nostra-2-Phase-1` across Phase 1 updates; Phase 3 can use `Nostra-2`.

GitHub sign-in comes from Git Credential Manager, GitHub CLI, or a token supplied in the process environment. Credentials are never printed or saved by this script. Uploads go to a draft first. The script verifies GitHub's uploaded hashes before publishing as the latest stable release. A failed upload leaves the draft for inspection; rerunning can resume a matching draft. Existing published releases are never overwritten.

Optional command-line example: `Publish-Release.bat --build 2 --title Nostra-2-Phase-1 --folder windows-build/build-2`. Add `--dry-run` to verify locally without using GitHub. `--yes` skips only the final interactive confirmation.
