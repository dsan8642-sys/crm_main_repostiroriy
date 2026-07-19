@echo off
setlocal
rem Produce the machine-readable Django + NocoBase cutover evidence matrix.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-hybrid-cutover-readiness.ps1" %*
exit /b %ERRORLEVEL%
