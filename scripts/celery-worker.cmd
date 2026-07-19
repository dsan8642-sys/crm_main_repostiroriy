@echo off
setlocal

rem Start the Celery worker for SwimCRM background jobs.

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
  if "%CELERY_BROKER_URL%"=="" (
    echo CELERY_BROKER_URL is required when DJANGO_ENV=%DJANGO_ENV%.
    exit 1
  )
)

if "%POSTGRES_DB%"=="" set "POSTGRES_DB=swimcrm"
if "%POSTGRES_USER%"=="" set "POSTGRES_USER=postgres"
if "%POSTGRES_PASSWORD%"=="" set "POSTGRES_PASSWORD=postgres"
if "%POSTGRES_HOST%"=="" set "POSTGRES_HOST=127.0.0.1"
if "%POSTGRES_PORT%"=="" set "POSTGRES_PORT=5432"
if "%CELERY_BROKER_URL%"=="" set "CELERY_BROKER_URL=redis://127.0.0.1:6379/0"
if "%CELERY_RESULT_BACKEND%"=="" set "CELERY_RESULT_BACKEND=%CELERY_BROKER_URL%"
set "PYTHONIOENCODING=utf-8"

cd /d "%~dp0..\swimcrm"
".venv\Scripts\celery.exe" -A config worker -l INFO
