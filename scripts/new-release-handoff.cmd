@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0new-release-handoff.ps1" %*
exit /b %ERRORLEVEL%
