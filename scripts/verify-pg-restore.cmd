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

if "%KEEP_TEMP_DB%"=="1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-pg-restore.ps1" -BackupFile "%BACKUP_FILE%" -TempDb "%TEMP_DB%" -KeepTempDb
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-pg-restore.ps1" -BackupFile "%BACKUP_FILE%" -TempDb "%TEMP_DB%"
)
exit /b %ERRORLEVEL%
