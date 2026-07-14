@echo off
setlocal

rem Create a PostgreSQL custom-format backup for SwimCRM.
rem Usage:
rem   scripts\backup-pg.cmd [out_dir]

set "OUT_DIR=%~1"
if "%OUT_DIR%"=="" set "OUT_DIR=.\backups"

if "%POSTGRES_DB%"=="" set "POSTGRES_DB=swimcrm"
if "%POSTGRES_USER%"=="" set "POSTGRES_USER=postgres"
if "%POSTGRES_PASSWORD%"=="" set "POSTGRES_PASSWORD=postgres"
if "%POSTGRES_HOST%"=="" set "POSTGRES_HOST=127.0.0.1"
if "%POSTGRES_PORT%"=="" set "POSTGRES_PORT=5432"
set "PGPASSWORD=%POSTGRES_PASSWORD%"

set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"
set "PG_DUMP=%PG_BIN%\pg_dump.exe"

if not exist "%PG_DUMP%" (
  echo pg_dump.exe not found: "%PG_DUMP%"
  exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
set "BACKUP_FILE=%OUT_DIR%\%POSTGRES_DB%-%STAMP%.dump"

"%PG_DUMP%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" -d "%POSTGRES_DB%" -Fc -f "%BACKUP_FILE%"
if errorlevel 1 (
  echo pg_dump failed.
  exit /b 1
)

echo Backup written: %BACKUP_FILE%
