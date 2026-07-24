@echo off
rem Check the live Django application health and operations status.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-app-health.ps1" %*
