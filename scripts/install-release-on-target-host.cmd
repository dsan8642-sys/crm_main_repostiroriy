@echo off
rem Install a verified SwimCRM release archive on a target host.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-release-on-target-host.ps1" %*
