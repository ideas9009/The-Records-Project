@echo off
powershell.exe -STA -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test-gemini-api.ps1"
