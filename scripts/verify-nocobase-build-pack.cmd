@echo off
setlocal
rem Verify the operator build pack for the first production-safe NocoBase screens.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-nocobase-build-pack.ps1" %*
exit /b %ERRORLEVEL%
