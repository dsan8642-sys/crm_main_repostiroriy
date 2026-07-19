@echo off
rem Check the live hybrid Django + NocoBase stack.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-hybrid-health.ps1" %*
