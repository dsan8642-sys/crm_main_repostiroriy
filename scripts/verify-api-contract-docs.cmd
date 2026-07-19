@echo off
rem Verify that docs/API_CONTRACT.md stays aligned with the machine-readable API contract.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-api-contract-docs.ps1" %*
