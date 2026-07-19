[CmdletBinding()]
param(
    [switch]$Postgres,
    [switch]$AllowMissingLocalNocoBaseRuntime
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
$NocoBasePrereqCheck = Join-Path $RepoRoot "scripts\verify-nocobase-prerequisites.ps1"
$NocoBaseRuntimeCheck = Join-Path $RepoRoot "scripts\verify-nocobase-runtime.ps1"
$NocoBaseBlueprintCheck = Join-Path $RepoRoot "scripts\verify-nocobase-blueprint.ps1"
$NocoBaseBuildPackCheck = Join-Path $RepoRoot "scripts\verify-nocobase-build-pack.ps1"
$NocoBaseApiSmokeCheck = Join-Path $RepoRoot "scripts\verify-nocobase-api-smoke.ps1"
$ProductionReadinessAuditCheck = Join-Path $RepoRoot "scripts\verify-production-readiness-audit.ps1"
$HybridCutoverCheck = Join-Path $RepoRoot "scripts\verify-hybrid-cutover-readiness.ps1"
$BackupRestoreGuardsCheck = Join-Path $RepoRoot "scripts\verify-backup-restore-guards.ps1"
$HybridBackup = Join-Path $RepoRoot "scripts\backup-hybrid.ps1"
$HybridRestore = Join-Path $RepoRoot "scripts\restore-hybrid.ps1"
$HybridHealth = Join-Path $RepoRoot "scripts\check-hybrid-health.ps1"

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
        "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND",
        "NOCOBASE_BRIDGE_TOKEN", "NOCOBASE_CONFIG_TOKEN",
        "NOCOBASE_APP_ENV", "NOCOBASE_APP_KEY", "NOCOBASE_APP_ROOT", "NOCOBASE_APP_PORT",
        "NOCOBASE_DB_HOST", "NOCOBASE_DB_PORT", "NOCOBASE_DB_DATABASE", "NOCOBASE_DB_USER",
        "NOCOBASE_DB_PASSWORD", "NOCOBASE_ROOT_USERNAME", "NOCOBASE_ROOT_EMAIL",
        "NOCOBASE_ROOT_PASSWORD", "NOCOBASE_STORAGE_DIR"
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
        $env:NOCOBASE_BRIDGE_TOKEN = "release-check-nocobase-bridge-token"
        $env:NOCOBASE_CONFIG_TOKEN = "release-check-nocobase-config-token"

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
        $env:NOCOBASE_BRIDGE_TOKEN = "prodpreflightbridgeTOKEN123456789012"
        $env:NOCOBASE_CONFIG_TOKEN = "prodpreflightconfigTOKEN123456789012"
        $env:NOCOBASE_APP_ENV = "production"
        $env:NOCOBASE_APP_KEY = "prodpreflightnocobaseappkey123456789012"
        $env:NOCOBASE_APP_ROOT = "C:\SwimCRMRuntime\nocobase-app"
        $env:NOCOBASE_APP_PORT = "13000"
        $env:NOCOBASE_DB_HOST = "127.0.0.1"
        $env:NOCOBASE_DB_PORT = "5432"
        $env:NOCOBASE_DB_DATABASE = "nocobase_hybrid"
        $env:NOCOBASE_DB_USER = "nocobase"
        $env:NOCOBASE_DB_PASSWORD = "prodpreflightnocobasedbpassword"
        $env:NOCOBASE_ROOT_USERNAME = "admin"
        $env:NOCOBASE_ROOT_EMAIL = "admin@crm.example.com"
        $env:NOCOBASE_ROOT_PASSWORD = "prodpreflightnocobaserootpassword123456"
        $env:NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"

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

    Invoke-NativeStep "NocoBase prerequisite check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NocoBasePrereqCheck
    }

    Invoke-NativeStep "NocoBase runtime guard check" {
        $args = @()
        if ($AllowMissingLocalNocoBaseRuntime) {
            $args += "-AllowMissingLocalRuntime"
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NocoBaseRuntimeCheck @args
    }

    Invoke-NativeStep "NocoBase first-screens blueprint check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NocoBaseBlueprintCheck
    }

    Invoke-NativeStep "NocoBase screen build pack check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NocoBaseBuildPackCheck
    }

    Invoke-NativeStep "NocoBase API build-pack smoke check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NocoBaseApiSmokeCheck
    }

    Invoke-NativeStep "Production readiness evidence audit" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ProductionReadinessAuditCheck
    }

    Invoke-NativeStep "Hybrid cutover readiness audit" {
        $args = @()
        if ($AllowMissingLocalNocoBaseRuntime) {
            $args += "-AllowMissingLocalNocoBaseRuntime"
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HybridCutoverCheck @args
    }

    Invoke-NativeStep "Backup/restore guard check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupRestoreGuardsCheck
    }

    Invoke-NativeStep "Hybrid backup plan check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HybridBackup -PlanOnly
    }

    Invoke-NativeStep "Hybrid restore plan check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HybridRestore -BackupSetDir $RepoRoot -PlanOnly
    }

    Invoke-NativeStep "Hybrid health plan check" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HybridHealth -RequireHttps -RequireOpsOk -PlanOnly
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
