[CmdletBinding()]
param(
    [switch]$Postgres
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
$RunPg = Join-Path $BackendDir "run-pg.ps1"
$ProductionEnvCheck = Join-Path $RepoRoot "scripts\check-production-env.ps1"
$ApiContractDocsCheck = Join-Path $RepoRoot "scripts\verify-api-contract-docs.ps1"
$ReleaseTreeCheck = Join-Path $RepoRoot "scripts\verify-release-tree.ps1"
$CiReleaseWorkflowCheck = Join-Path $RepoRoot "scripts\verify-ci-release-workflow.ps1"
$OperationalWrappersCheck = Join-Path $RepoRoot "scripts\verify-operational-wrappers.ps1"
$ProductionReadinessAuditCheck = Join-Path $RepoRoot "scripts\verify-production-readiness-audit.ps1"
$AppCutoverCheck = Join-Path $RepoRoot "scripts\verify-app-cutover-readiness.ps1"
$AppHealth = Join-Path $RepoRoot "scripts\check-app-health.ps1"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python. Run task 1 setup first."
}

$SavedAuditLogLevel = [Environment]::GetEnvironmentVariable("AUDIT_LOG_LEVEL", "Process")
if ([string]::IsNullOrWhiteSpace($SavedAuditLogLevel)) {
    $env:AUDIT_LOG_LEVEL = "WARNING"
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
    foreach ($Name in @(
        "DJANGO_ENV", "DEBUG", "SECRET_KEY", "ALLOWED_HOSTS", "SWIMCRM_RUNTIME_DIR",
        "STATIC_ROOT", "MEDIA_ROOT", "BACKUP_DIR", "SECURE_SSL_REDIRECT",
        "TRUST_PROXY_SSL_HEADER", "CSRF_TRUSTED_ORIGINS",
        "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT",
        "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND"
    )) {
        $SavedEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
    }

    try {
        $env:DJANGO_ENV = "production"
        $env:DEBUG = "0"
        $env:SECRET_KEY = "release-check-secret-key-abcdefghijklmnopqrstuvwxyz-0123456789"
        $env:ALLOWED_HOSTS = "crm.example.com"
        $env:SWIMCRM_RUNTIME_DIR = "C:\SwimCRMRuntime"
        $env:POSTGRES_DB = "swimcrm"
        $env:POSTGRES_USER = "swimcrm"
        $env:POSTGRES_PASSWORD = "release-check-db-password"
        $env:POSTGRES_HOST = "127.0.0.1"
        $env:POSTGRES_PORT = "5432"

        Invoke-NativeStep "Production deploy check" {
            & $Python "manage.py" "check" "--deploy"
        }

        $env:SECRET_KEY = "prodpreflightsecretabcdefghijklmnopqrstuvwxyz0123456789"
        $env:STATIC_ROOT = "C:\SwimCRMRuntime\staticfiles"
        $env:MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
        $env:BACKUP_DIR = "C:\SwimCRMRuntime\backups"
        $env:SECURE_SSL_REDIRECT = "1"
        $env:TRUST_PROXY_SSL_HEADER = "1"
        $env:CSRF_TRUSTED_ORIGINS = "https://crm.example.com"
        $env:POSTGRES_DB = "swimcrm"
        $env:POSTGRES_USER = "swimcrm"
        $env:POSTGRES_PASSWORD = "prodpreflightdbpassword"
        $env:POSTGRES_HOST = "127.0.0.1"
        $env:POSTGRES_PORT = "5432"
        $env:CELERY_BROKER_URL = "redis://127.0.0.1:6379/0"
        $env:CELERY_RESULT_BACKEND = "redis://127.0.0.1:6379/0"

        Invoke-NativeStep "Production environment preflight check" {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ProductionEnvCheck
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

    Invoke-NativeStep "API contract docs check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ApiContractDocsCheck
    }

    Invoke-NativeStep "CI release workflow check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $CiReleaseWorkflowCheck
    }

    Invoke-NativeStep "Operational wrapper guard check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $OperationalWrappersCheck
    }

    Invoke-NativeStep "Production readiness evidence audit" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ProductionReadinessAuditCheck
    }

    Invoke-NativeStep "App cutover readiness audit" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AppCutoverCheck
    }

    Invoke-NativeStep "App health plan check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AppHealth -RequireHttps -RequireOpsOk -PlanOnly
    }
}
finally {
    Pop-Location
    if ($null -eq $SavedAuditLogLevel) {
        [Environment]::SetEnvironmentVariable("AUDIT_LOG_LEVEL", $null, "Process")
    }
    else {
        [Environment]::SetEnvironmentVariable("AUDIT_LOG_LEVEL", $SavedAuditLogLevel, "Process")
    }
}

Write-Host ""
Write-Host "Backend release checks passed."
