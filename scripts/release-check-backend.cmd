@echo off
setlocal

rem Run repeatable backend release checks. Pass -Postgres to include PostgreSQL.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0release-check-backend.ps1" %*
exit /b %ERRORLEVEL%
