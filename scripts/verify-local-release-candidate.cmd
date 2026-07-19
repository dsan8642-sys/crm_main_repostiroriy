@echo off
setlocal
rem Verify a clean local release candidate, source archive, and optional cutover evidence.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-local-release-candidate.ps1" %*
exit /b %ERRORLEVEL%
