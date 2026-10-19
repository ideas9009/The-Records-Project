# Windows MSI releases

Nostra-1 users uninstall the Flutter app and install Nostra-2 manually. No legacy migration, folder move or registry rename is performed.

## Build

Use a Visual Studio developer shell. With the Dart SDK on PATH run `npm run package:msi`, or pass `-DartPath` directly to `scripts/build-msi.ps1`. The helper uses Dart/Dio for downloading, compiled as a self-contained EXE resource; the distributable installer is an MSI.

The public verification key is in `updater/lib/public_key.dart`. The matching private Ed25519 signing key was generated outside the repository under `%LOCALAPPDATA%/TheRecordsProjectReleaseKeys/update-private.pem`. Back it up securely before distributing this first build. Do not commit or upload that private file. `TRP_UPDATE_KEY_DIR` can specify another private key directory. CI may supply `TRP_UPDATE_PRIVATE_KEY` as a secret PEM value.

To create a key for a completely new product only, use `node scripts/update-release.mjs --init`. Never replace the key after release: installed clients trust the current public key.

## Publish (manual, after installer testing)

1. Keep `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` versions aligned. Use increasing stable numeric versions, e.g. 2.0.0, 2.0.1.
2. Build the MSI and signed metadata with the script. Output is in `src-tauri/target/release/bundle/msi/`.
3. Create a stable release tagged `v<version>` in `ideas9009/The-Records-Project` with exactly these assets: the generated x64 English MSI, `update-windows-x86_64.json`, and `update-windows-x86_64.json.sig`.
4. Upload all assets before publishing the release. Do not rename the MSI after signing the metadata. Incomplete or unsigned releases are rejected.

The JSON signature authenticates the version, exact MSI URL, byte count and SHA-256 digest. This is updater verification, separate from Windows Authenticode signing or SmartScreen reputation. The downloader does not strip zone information or change Defender settings. No prompt-free behaviour is guaranteed.

## Behaviour

The Windows app checks on launch, on the online event and every six hours while online. An available update replaces the sidebar branding; click it to expand details and download progress. Downloading does not close the app. Install and restart is a separate user action and honours form navigation guards. The helper re-verifies the MSI, waits for the app process to exit, invokes Windows Installer with a visible passive progress UI, and relaunches the installed executable. Failed installs reopen the previous app with an error. Windows may request administrator approval. Logs are retained in the temporary `trp-update-*` directory; the MSI is removed only on success.

About offers Check for updates and Reinstall current version. Reinstall uses the exact `v<installed version>` release; it cannot silently downgrade or select an unrelated MSI. Local data directories are not removed. The dev website has a simulated sidebar-prompt preview that never downloads or installs files; it is excluded from production builds.

End-to-end installation, reinstallation, interrupted downloads, custom install paths and a version-to-version upgrade remain to be tested before general release. Do not publish a release automatically from this development task.
