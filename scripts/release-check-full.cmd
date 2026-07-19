@echo off
setlocal
rem Run backend release checks plus frontend build/smoke verification.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0release-check-full.ps1" %*
exit /b %ERRORLEVEL%
