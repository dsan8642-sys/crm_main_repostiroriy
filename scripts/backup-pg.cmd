@echo off
setlocal

rem Create a PostgreSQL custom-format backup for SwimCRM.
rem Usage:
rem   scripts\backup-pg.cmd [out_dir]

set "OUT_DIR=%~1"
if "%OUT_DIR%"=="" set "OUT_DIR=.\backups"

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
  if "%BACKUP_DIR%"=="" (
    echo BACKUP_DIR is required when DJANGO_ENV=%DJANGO_ENV%.
    exit 1
  )
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-pg.ps1" -OutDir "%OUT_DIR%"
exit %ERRORLEVEL%
