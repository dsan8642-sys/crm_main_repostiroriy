@echo off
setlocal
rem Run frontend dependency install, production build, and Playwright smoke tests.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-frontend-release.ps1" %*
exit /b %ERRORLEVEL%
