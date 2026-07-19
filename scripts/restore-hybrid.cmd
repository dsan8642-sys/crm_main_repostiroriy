@echo off
setlocal
rem Restore a full-stack Django + NocoBase backup set. Requires -ConfirmRestore.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-hybrid.ps1" %*
