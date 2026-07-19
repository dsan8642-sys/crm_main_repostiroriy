@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-ci-release-workflow.ps1" %*
exit /b %ERRORLEVEL%
