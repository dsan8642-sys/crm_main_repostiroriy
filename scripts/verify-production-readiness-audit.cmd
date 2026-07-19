@echo off
rem Verify the machine-readable production readiness evidence manifest.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-production-readiness-audit.ps1" %*
