@echo off
setlocal

rem Verify the source tree does not contain release-blocking runtime artifacts.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-release-tree.ps1" %*
exit /b %ERRORLEVEL%

