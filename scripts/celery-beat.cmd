@echo off
setlocal

rem Start Celery beat for SwimCRM periodic jobs.

if "%POSTGRES_DB%"=="" set "POSTGRES_DB=swimcrm"
if "%POSTGRES_USER%"=="" set "POSTGRES_USER=postgres"
if "%POSTGRES_PASSWORD%"=="" set "POSTGRES_PASSWORD=postgres"
if "%POSTGRES_HOST%"=="" set "POSTGRES_HOST=127.0.0.1"
if "%POSTGRES_PORT%"=="" set "POSTGRES_PORT=5432"
if "%CELERY_BROKER_URL%"=="" set "CELERY_BROKER_URL=redis://127.0.0.1:6379/0"
if "%CELERY_RESULT_BACKEND%"=="" set "CELERY_RESULT_BACKEND=%CELERY_BROKER_URL%"
set "PYTHONIOENCODING=utf-8"

cd /d "%~dp0..\swimcrm"
".venv\Scripts\celery.exe" -A config beat -l INFO
