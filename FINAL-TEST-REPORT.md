# Final verification — 20 October 2026

Result: automated checks and the isolated Windows updater cycle passed. No GitHub release was created or edited, no live TRP records were removed, and the main installed app was not changed.

| Check | Result |
| --- | --- |
| React/client tests | 161 passed across 30 files |
| API/server tests | 177 passed |
| Dart analysis | No issues |
| Dart updater tests | 8 passed |
| Native Rust tests | 5 passed |
| Native live EarthMC TLS check | Passed separately; Byzantium returned |
| Production website build | Passed |
| Production Windows MSI build | Passed |
| Production MSI signature, signed build and SHA-256 | Verified, including the copied release folder |
| Installed isolated updater: build 0 to build 1 | Windows Installer success; relaunched into build 1 and reported up to date |
| Installed isolated updater: same-build reinstall | Windows Installer success; relaunched and reported up to date |
| Interrupted download | Rejected; no installation |
| Invalid metadata signature | Rejected; no installation |
| Corrupted MSI with unchanged signed metadata | Rejected by digest verification; no installation |
| Current live GitHub check | Helper responds correctly; latest release rejected because its tag is not a numeric build number |

The isolated helper was refreshed from the current production Dart source. Only local test endpoints and the test public key differ. The lab has a separate app/installer identity and no TRP account data. Test fixtures were restored and the local feed was stopped.

The fresh lab build exposed a Windows PowerShell 5 UTF-8 BOM problem in its configuration-writing script. The script now explicitly writes UTF-8 without a BOM. The lab MSI rebuilt successfully and was used in the successful upgrade/reinstall test.

## Prepared local production assets

The current website, book icon and updater are included in `windows-build/build-2/`:

- `The-Records-Project_1.4.0_x64_en-US.msi` — 37,306,368 bytes
- `update-windows-x86_64.json`
- `update-windows-x86_64.json.sig`

MSI SHA-256: `d9effe763787011729b605021e83ab07708c2d3f4799f737cef3124ba0ca50bc`.

React build: 2. MSI version: 1.4.0. Availability uses the numeric latest-release tag, not the MSI version or release title. Windows Installer still applies its own installation rules.

## Remaining release checks

- The latest stable GitHub release must have the intended numeric tag (`2` for these production assets) and all three matching assets. This test did not change or publish the release.
- The production per-machine MSI still needs a normal installation/elevation smoke test. The isolated per-user lab test does not prove the main installer's elevation behavior.

Build warnings were limited to the existing frontend chunk size/dynamic-import notices and unused command functions in the intentionally minimal lab.

Detailed isolated results and installer logs are retained in `tmp/final-updater-tests/` and the corresponding Windows temporary `trp-update-*` job folders. Private signing material remains outside Git.
