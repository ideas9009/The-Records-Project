param([string]$DartPath = "dart")
$ErrorActionPreference="Stop"
Push-Location "$PSScriptRoot/.."
try {
 New-Item -ItemType Directory -Force -Path src-tauri/resources/updater | Out-Null
 & $DartPath pub get --directory updater
 if ($LASTEXITCODE -ne 0) { throw "Dart dependency setup failed" }
 & $DartPath compile exe updater/bin/updater.dart -o src-tauri/resources/updater/trp-updater.exe
 if ($LASTEXITCODE -ne 0) { throw "Dart updater compilation failed" }
 npm run tauri -- build --bundles msi
 if ($LASTEXITCODE -ne 0) { throw "MSI build failed" }
 $releaseMsi=Get-ChildItem src-tauri/target/release/bundle/msi/*.msi | Sort-Object LastWriteTime -Descending | Select-Object -First 1
 node scripts/update-release.mjs $releaseMsi.FullName
 if ($LASTEXITCODE -ne 0) { throw "Release metadata signing failed" }
 & $DartPath run updater/bin/verify_release.dart $releaseMsi.DirectoryName
 if ($LASTEXITCODE -ne 0) { throw "Signed MSI verification failed" }
 Write-Host "MSI and signed release metadata are ready in $($releaseMsi.DirectoryName)"
} finally { Pop-Location }
