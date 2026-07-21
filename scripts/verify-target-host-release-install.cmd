@echo off
rem Verify that a target-host release install matches the release archive.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-target-host-release-install.ps1" %*
