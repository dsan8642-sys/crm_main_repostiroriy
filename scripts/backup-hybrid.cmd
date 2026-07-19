@echo off
setlocal
rem Create a full-stack Django + NocoBase backup set.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-hybrid.ps1" %*
