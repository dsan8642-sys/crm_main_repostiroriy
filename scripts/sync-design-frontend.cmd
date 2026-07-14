@echo off
setlocal

rem Copy design-system runtime assets from design\ into frontend\src\design.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-design-frontend.ps1"
exit /b %ERRORLEVEL%
