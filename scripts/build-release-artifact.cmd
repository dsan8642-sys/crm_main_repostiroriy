@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release-artifact.ps1" %*
exit /b %ERRORLEVEL%
