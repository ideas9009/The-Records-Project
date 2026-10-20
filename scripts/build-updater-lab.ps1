param(
 [ValidateSet(0,1)][int]$Build = 0,
 [switch]$GitHubCheck,
 [string]$DartPath = 'dart'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
Push-Location $projectRoot
try {
 $configPath = 'updater-lab/src-tauri/tauri.conf.json'
 $config = Get-Content -Raw $configPath | ConvertFrom-Json
 $config.version = "0.1.$Build"
 $env:CARGO_TARGET_DIR = Join-Path $projectRoot 'src-tauri/target'
 $env:CARGO_BUILD_JOBS = '2'
 $env:TRP_LAB_BUILD = "$Build"
 New-Item -ItemType Directory -Force updater-lab/src-tauri/resources | Out-Null
 if ($GitHubCheck) {
   $env:TRP_LAB_FIXTURE = '0'
   $config.bundle.windows.wix.PSObject.Properties.Remove('template')
   [IO.File]::WriteAllText((Join-Path $projectRoot $configPath), ($config | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
   & $DartPath compile exe updater/bin/updater.dart -o updater-lab/src-tauri/resources/trp-updater.exe
 } else {
   $env:TRP_LAB_FIXTURE = '1'
   $config.bundle.windows.wix | Add-Member -Force NoteProperty template '../fixtures/lab-template.wxs'
   [IO.File]::WriteAllText((Join-Path $projectRoot $configPath), ($config | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
   node scripts/prepare-updater-lab.mjs prepare
   if ($LASTEXITCODE -ne 0) {throw 'Fixture preparation failed'}
   & $DartPath pub get --directory updater-lab/helper
   if ($LASTEXITCODE -ne 0) {throw 'Fixture dependencies failed'}
   & $DartPath compile exe updater-lab/helper/bin/updater.dart -o updater-lab/src-tauri/resources/trp-updater.exe
 }
 if ($LASTEXITCODE -ne 0) {throw 'Helper compilation failed'}
 Push-Location updater-lab
 try {node ../node_modules/@tauri-apps/cli/tauri.js build --bundles msi} finally {Pop-Location}
 if ($LASTEXITCODE -ne 0) {throw 'Lab MSI build failed'}
 if (!$GitHubCheck -and $Build -eq 1) {
  node scripts/prepare-updater-lab.mjs "src-tauri/target/release/bundle/msi/TRP Updater Lab_0.1.1_x64_en-US.msi"
  if ($LASTEXITCODE -ne 0) {throw 'Fixture signing failed'}
 }
} finally {
 Remove-Item Env:TRP_LAB_FIXTURE,Env:TRP_LAB_BUILD -ErrorAction SilentlyContinue
 Pop-Location
}
