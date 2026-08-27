@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-release-artifact.ps1" %*
exit /b %ERRORLEVEL%
