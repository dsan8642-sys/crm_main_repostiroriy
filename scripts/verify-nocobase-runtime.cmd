@echo off
setlocal
rem Verify NocoBase runtime plan and production guards.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-nocobase-runtime.ps1" %*
exit /b %ERRORLEVEL%
