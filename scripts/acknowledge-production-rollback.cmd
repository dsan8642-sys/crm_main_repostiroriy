@echo off
rem Record an explicit production rollback acknowledgement for cutover evidence.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0acknowledge-production-rollback.ps1" %*
