[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Wrappers = @(
    "celery-worker.cmd",
    "celery-beat.cmd",
    "run-due-jobs.cmd",
    "backup-postgres-django.cmd",
    "backup-pg.cmd"
)
$EnvNames = @(
    "DJANGO_ENV",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "CELERY_BROKER_URL",
    "CELERY_RESULT_BACKEND",
    "BACKUP_DIR"
)

function Invoke-ProductionGuardCheck {
    param([string]$Wrapper)

    $saved = @{}
    foreach ($name in $EnvNames) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    }

    try {
        foreach ($name in $EnvNames) {
            [Environment]::SetEnvironmentVariable($name, $null, "Process")
        }
        $env:DJANGO_ENV = "production"

        $scriptPath = Join-Path $RepoRoot "scripts\$Wrapper"
        $output = & cmd.exe /c "`"$scriptPath`"" 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            throw "$Wrapper did not reject missing production environment variables."
        }
        if (($output -join "`n") -notmatch "POSTGRES_DB is required") {
            throw "$Wrapper failed, but not with the expected production guard message. Output: $output"
        }
    }
    finally {
        foreach ($name in $EnvNames) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process")
        }
    }
}

function Invoke-ProductionDefaultPasswordCheck {
    param([string]$Wrapper)

    $saved = @{}
    foreach ($name in $EnvNames) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    }

    try {
        $env:DJANGO_ENV = "production"
        $env:POSTGRES_DB = "swimcrm"
        $env:POSTGRES_USER = "postgres"
        $env:POSTGRES_PASSWORD = "postgres"
        $env:POSTGRES_HOST = "127.0.0.1"
        $env:POSTGRES_PORT = "5432"
        $env:CELERY_BROKER_URL = "redis://127.0.0.1:6379/0"
        $env:CELERY_RESULT_BACKEND = "redis://127.0.0.1:6379/0"
        $env:BACKUP_DIR = "C:\SwimCRMRuntime\backups"

        $scriptPath = Join-Path $RepoRoot "scripts\$Wrapper"
        $output = & cmd.exe /c "`"$scriptPath`"" 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            throw "$Wrapper accepted the development PostgreSQL password in production."
        }
        if (($output -join "`n") -notmatch "development default") {
            throw "$Wrapper failed, but not with the expected default-password guard message. Output: $output"
        }
    }
    finally {
        foreach ($name in $EnvNames) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process")
        }
    }
}

foreach ($wrapper in $Wrappers) {
    Invoke-ProductionGuardCheck -Wrapper $wrapper
    Invoke-ProductionDefaultPasswordCheck -Wrapper $wrapper
    Write-Host "Production guard check passed: $wrapper"
}

$restoreWrapper = Join-Path $RepoRoot "scripts\verify-pg-restore.cmd"
$restoreText = Get-Content -LiteralPath $restoreWrapper -Raw
if ($restoreText -notmatch "verify-pg-restore\.ps1") {
    throw "verify-pg-restore.cmd must delegate to verify-pg-restore.ps1 so production guards cannot drift."
}
if ($restoreText -match "POSTGRES_PASSWORD=postgres" -or $restoreText -match "PGPASSWORD" -or $restoreText -match "pg_restore\.exe") {
    throw "verify-pg-restore.cmd must not set development passwords or bypass the guarded PowerShell restore verifier."
}
Write-Host "Production guard check passed: verify-pg-restore.cmd"

Write-Host "Operational wrapper checks passed."
