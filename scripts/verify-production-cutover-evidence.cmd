@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-production-cutover-evidence.ps1" %*
exit /b %ERRORLEVEL%
