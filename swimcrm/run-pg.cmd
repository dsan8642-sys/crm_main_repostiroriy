@echo off
setlocal

rem Run manage.py against the local PostgreSQL dev database.
rem This mirrors run-pg.ps1, but works when PowerShell script execution is disabled.

set "POSTGRES_DB=swimcrm"
set "POSTGRES_USER=postgres"
set "POSTGRES_PASSWORD=postgres"
set "POSTGRES_HOST=127.0.0.1"
set "POSTGRES_PORT=5432"
set "PYTHONIOENCODING=utf-8"

"%~dp0.venv\Scripts\python.exe" "%~dp0manage.py" %*
