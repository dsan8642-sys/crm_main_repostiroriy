@echo off
setlocal

rem Validate the current production environment and run Django deploy checks.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-production-env.ps1"
exit /b %ERRORLEVEL%

