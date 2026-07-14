@echo off
setlocal

rem Cron/Task Scheduler fallback for due jobs when Celery/Redis is not running.

if "%POSTGRES_DB%"=="" set "POSTGRES_DB=swimcrm"
if "%POSTGRES_USER%"=="" set "POSTGRES_USER=postgres"
if "%POSTGRES_PASSWORD%"=="" set "POSTGRES_PASSWORD=postgres"
if "%POSTGRES_HOST%"=="" set "POSTGRES_HOST=127.0.0.1"
if "%POSTGRES_PORT%"=="" set "POSTGRES_PORT=5432"
set "PYTHONIOENCODING=utf-8"

cd /d "%~dp0..\swimcrm"
".venv\Scripts\python.exe" manage.py run_due_jobs
