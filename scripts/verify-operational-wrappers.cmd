@echo off
setlocal
rem Verify production guardrails for operational command wrappers.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-operational-wrappers.ps1" %*
exit /b %ERRORLEVEL%
