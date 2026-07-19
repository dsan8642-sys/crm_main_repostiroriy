@echo off
setlocal
rem Run focused Django smoke tests for NocoBase bridge/config API contracts.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-nocobase-api-smoke.ps1" %*
exit /b %ERRORLEVEL%
