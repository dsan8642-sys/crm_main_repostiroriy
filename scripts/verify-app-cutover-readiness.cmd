@echo off
setlocal
rem Produce the machine-readable Django cutover readiness matrix.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-app-cutover-readiness.ps1" %*
exit /b %ERRORLEVEL%
