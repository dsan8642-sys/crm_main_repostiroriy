@echo off
setlocal
rem Verify production guardrails for Django + NocoBase backup and restore scripts.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-backup-restore-guards.ps1" %*
exit /b %ERRORLEVEL%
