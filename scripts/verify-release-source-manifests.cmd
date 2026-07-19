@echo off
rem Verify required release-source package manifests for hybrid NocoBase builds.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-release-source-manifests.ps1" %*
exit /b %ERRORLEVEL%
