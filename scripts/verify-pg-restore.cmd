@echo off
setlocal

rem Restore a backup into a temporary database, verify it, then drop the temp DB.
rem Usage:
rem   scripts\verify-pg-restore.cmd backups\swimcrm-YYYYMMDD-HHMMSS.dump [temp_db]
rem Set KEEP_TEMP_DB=1 to keep the temporary database for inspection.

set "BACKUP_FILE=%~1"
if "%BACKUP_FILE%"=="" (
  echo Usage: scripts\verify-pg-restore.cmd backups\swimcrm-YYYYMMDD-HHMMSS.dump [temp_db]
  exit /b 2
)
if not exist "%BACKUP_FILE%" (
  echo Backup file not found: "%BACKUP_FILE%"
  exit /b 1
)

set "TEMP_DB=%~2"
if "%TEMP_DB%"=="" set "TEMP_DB=swimcrm_restore_check"

if "%POSTGRES_USER%"=="" set "POSTGRES_USER=postgres"
if "%POSTGRES_PASSWORD%"=="" set "POSTGRES_PASSWORD=postgres"
if "%POSTGRES_HOST%"=="" set "POSTGRES_HOST=127.0.0.1"
if "%POSTGRES_PORT%"=="" set "POSTGRES_PORT=5432"
set "PGPASSWORD=%POSTGRES_PASSWORD%"

set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"
set "DROPDB=%PG_BIN%\dropdb.exe"
set "CREATEDB=%PG_BIN%\createdb.exe"
set "PG_RESTORE=%PG_BIN%\pg_restore.exe"
set "PSQL=%PG_BIN%\psql.exe"

for %%T in ("%DROPDB%" "%CREATEDB%" "%PG_RESTORE%" "%PSQL%") do (
  if not exist %%T (
    echo PostgreSQL tool not found: %%T
    exit /b 1
  )
)

"%DROPDB%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" --if-exists "%TEMP_DB%"
"%CREATEDB%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" "%TEMP_DB%"
if errorlevel 1 (
  echo createdb failed.
  exit /b 1
)

"%PG_RESTORE%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" -d "%TEMP_DB%" --clean --if-exists "%BACKUP_FILE%"
if errorlevel 1 (
  echo pg_restore failed.
  exit /b 1
)

"%PSQL%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" -d "%TEMP_DB%" -c "select count(*) as django_migrations from django_migrations;"
if errorlevel 1 (
  echo restore verification query failed.
  exit /b 1
)

"%PSQL%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" -d "%TEMP_DB%" -c "select conname, contype from pg_constraint where conname = 'excl_trainer_time_overlap';"
if errorlevel 1 (
  echo restore constraint verification failed.
  exit /b 1
)

echo Restore verification OK in temp database: %TEMP_DB%
if not "%KEEP_TEMP_DB%"=="1" (
  "%DROPDB%" -w -h "%POSTGRES_HOST%" -p "%POSTGRES_PORT%" -U "%POSTGRES_USER%" --if-exists "%TEMP_DB%"
  if errorlevel 1 (
    echo cleanup dropdb failed.
    exit /b 1
  )
  echo Temp database dropped: %TEMP_DB%
) else (
  echo Temp database kept: %TEMP_DB%
)
