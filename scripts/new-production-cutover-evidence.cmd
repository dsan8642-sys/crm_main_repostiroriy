@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0new-production-cutover-evidence.ps1" %*
exit /b %ERRORLEVEL%
