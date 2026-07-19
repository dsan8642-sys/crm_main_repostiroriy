@echo off
setlocal
rem Verify Node.js, npm, and Yarn prerequisites for the NocoBase runtime.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-nocobase-prerequisites.ps1" %*
exit /b %ERRORLEVEL%
