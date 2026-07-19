@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-hybrid-backup-set.ps1" %*
