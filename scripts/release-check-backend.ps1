[CmdletBinding()]
param(
    [switch]$Postgres
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
$RunPg = Join-Path $BackendDir "run-pg.ps1"
$ReleaseTreeCheck = Join-Path $RepoRoot "scripts\verify-release-tree.ps1"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python. Run task 1 setup first."
}

function Invoke-NativeStep {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Push-Location $BackendDir
try {
    Invoke-NativeStep "SQLite backend tests" {
        & $Python "manage.py" "test" "tests"
    }

    $SavedEnv = @{}
    foreach ($Name in @("DJANGO_ENV", "DEBUG", "SECRET_KEY", "ALLOWED_HOSTS", "SWIMCRM_RUNTIME_DIR")) {
        $SavedEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
    }

    try {
        $env:DJANGO_ENV = "production"
        $env:DEBUG = "0"
        $env:SECRET_KEY = "release-check-secret-key-abcdefghijklmnopqrstuvwxyz-0123456789"
        $env:ALLOWED_HOSTS = "crm.example.com"
        $env:SWIMCRM_RUNTIME_DIR = "C:\SwimCRMRuntime"

        Invoke-NativeStep "Production deploy check" {
            & $Python "manage.py" "check" "--deploy"
        }
    }
    finally {
        foreach ($Name in $SavedEnv.Keys) {
            if ($null -eq $SavedEnv[$Name]) {
                [Environment]::SetEnvironmentVariable($Name, $null, "Process")
            }
            else {
                [Environment]::SetEnvironmentVariable($Name, $SavedEnv[$Name], "Process")
            }
        }
    }

    if ($Postgres) {
        if (-not (Test-Path -LiteralPath $RunPg)) {
            throw "PostgreSQL helper not found at $RunPg."
        }
        Invoke-NativeStep "PostgreSQL backend tests" {
            & $RunPg "test" "--noinput" "tests"
        }
    }

    Invoke-NativeStep "Release artifact scan" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ReleaseTreeCheck
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Backend release checks passed."
