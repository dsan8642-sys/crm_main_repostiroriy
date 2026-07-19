@echo off
setlocal

rem Cron/Task Scheduler fallback for due jobs when Celery/Redis is not running.

set "PRODUCTION_ENV="
if /I "%DJANGO_ENV%"=="production" set "PRODUCTION_ENV=1"
if /I "%DJANGO_ENV%"=="prod" set "PRODUCTION_ENV=1"

if "%PRODUCTION_ENV%"=="1" (
  if "%POSTGRES_DB%"=="" (
    echo POSTGRES_DB is required when DJANGO_ENV=%DJANGO_ENV%.
    exit 1
  )
  if "%POSTGRES_USER%"=="" (
    echo POSTGRES_USER is required when DJANGO_ENV=%DJANGO_ENV%.
    exit 1
  )
  if "%POSTGRES_PASSWORD%"=="" (
    echo POSTGRES_PASSWORD is required when DJANGO_ENV=%DJANGO_ENV%.
    exit 1
  )
  if "%POSTGRES_PASSWORD%"=="postgres" (
    echo POSTGRES_PASSWORD must not use the development default in production.
    exit 1
  )
)

if "%POSTGRES_DB%"=="" set "POSTGRES_DB=swimcrm"
if "%POSTGRES_USER%"=="" set "POSTGRES_USER=postgres"
if "%POSTGRES_PASSWORD%"=="" set "POSTGRES_PASSWORD=postgres"
if "%POSTGRES_HOST%"=="" set "POSTGRES_HOST=127.0.0.1"
if "%POSTGRES_PORT%"=="" set "POSTGRES_PORT=5432"
set "PYTHONIOENCODING=utf-8"

cd /d "%~dp0..\swimcrm"
".venv\Scripts\python.exe" manage.py run_due_jobs
