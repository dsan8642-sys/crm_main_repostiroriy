@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-release-handoff.ps1" %*
exit /b %ERRORLEVEL%
