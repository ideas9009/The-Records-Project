@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node scripts\publish-release.mjs %*
set "publishResult=%errorlevel%"
echo.
if not "%TRP_PUBLISH_NO_PAUSE%"=="1" pause
exit /b %publishResult%
