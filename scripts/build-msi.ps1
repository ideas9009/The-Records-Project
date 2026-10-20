param([string]$DartPath = "dart")
$ErrorActionPreference="Stop"
Push-Location "$PSScriptRoot/.."
try {
 node scripts/prepare-app-icons.mjs
 if ($LASTEXITCODE -ne 0) { throw "App icon preparation failed" }
 npm run tauri -- icon src-tauri/app-icon.png
 if ($LASTEXITCODE -ne 0) { throw "Native icon generation failed" }
 New-Item -ItemType Directory -Force -Path src-tauri/resources/updater | Out-Null
 & $DartPath pub get --directory updater
 if ($LASTEXITCODE -ne 0) { throw "Dart dependency setup failed" }
 & $DartPath compile exe updater/bin/updater.dart -o src-tauri/resources/updater/trp-updater.exe
 if ($LASTEXITCODE -ne 0) { throw "Dart updater compilation failed" }
 npm run tauri -- build --bundles msi
 if ($LASTEXITCODE -ne 0) { throw "MSI build failed" }
 $appConfig = Get-Content -Raw src-tauri/tauri.conf.json | ConvertFrom-Json
 $releaseMsi = Get-Item -LiteralPath "src-tauri/target/release/bundle/msi/$($appConfig.productName)_$($appConfig.version)_x64_en-US.msi"
 $safeName = $releaseMsi.Name.Replace(" ", "-")
 if ($safeName -ne $releaseMsi.Name) {
   $safePath = Join-Path $releaseMsi.DirectoryName $safeName
   Copy-Item -LiteralPath $releaseMsi.FullName -Destination $safePath -Force
   $releaseMsi = Get-Item -LiteralPath $safePath
 }
 node scripts/update-release.mjs $releaseMsi.FullName
 if ($LASTEXITCODE -ne 0) { throw "Release metadata signing failed" }
 & $DartPath run updater/bin/verify_release.dart $releaseMsi.DirectoryName
 if ($LASTEXITCODE -ne 0) { throw "Signed MSI verification failed" }
 Write-Host "MSI and signed release metadata are ready in $($releaseMsi.DirectoryName)"
} finally { Pop-Location }
