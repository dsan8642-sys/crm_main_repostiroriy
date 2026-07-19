@echo off
setlocal
rem Verify the first production-safe NocoBase screens blueprint.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-nocobase-blueprint.ps1" %*
exit /b %ERRORLEVEL%
