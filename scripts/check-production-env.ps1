[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
. (Join-Path $PSScriptRoot "lib-production-guards.ps1")

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python."
}

function Require-Env {
    param([string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required production environment variable is missing: $Name"
    }
    return $value
}

function Assert-RealProductionSecret {
    param(
        [string]$Name,
        [string]$Value,
        [int]$MinLength = 32
    )
    if ($Value.Length -lt $MinLength -or $Value -match "dev-insecure|release-check|change-me|example|Admin!2026pass") {
        throw "$Name must be a real production secret at least $MinLength characters long, not a placeholder."
    }
}

function Require-HttpsOriginList {
    param([string]$Name)
    $value = Require-Env $Name
    $origins = $value.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    if (-not $origins -or $origins.Count -eq 0) {
        throw "$Name must contain at least one HTTPS production origin."
    }
    foreach ($origin in $origins) {
        if ($origin -notmatch "^https://") {
            throw "$Name must contain HTTPS origins only: $origin"
        }
        if ($origin -match "\*|localhost|127\.0\.0\.1|\[::1\]") {
            throw "$Name must contain explicit production origins only: $origin"
        }
    }
    return $origins
}

$envName = Require-Env "DJANGO_ENV"
if ($envName -notin @("prod", "production")) {
    throw "DJANGO_ENV must be production or prod."
}

$debug = Require-Env "DEBUG"
if ($debug -ne "0") {
    throw "DEBUG must be 0."
}

$secret = Require-Env "SECRET_KEY"
Assert-RealProductionSecret -Name "SECRET_KEY" -Value $secret -MinLength 50

$allowedHosts = Require-Env "ALLOWED_HOSTS"
if ($allowedHosts -match "\*" -or $allowedHosts -match "localhost|127\.0\.0\.1") {
    throw "ALLOWED_HOSTS must contain explicit production hostnames only."
}

$secureSslRedirect = [Environment]::GetEnvironmentVariable("SECURE_SSL_REDIRECT", "Process")
if ([string]::IsNullOrWhiteSpace($secureSslRedirect)) {
    $secureSslRedirect = "1"
}
if ($secureSslRedirect -ne "1") {
    throw "SECURE_SSL_REDIRECT must be 1 in production."
}

$trustProxyHeader = Require-Env "TRUST_PROXY_SSL_HEADER"
if ($trustProxyHeader -ne "1") {
    throw "TRUST_PROXY_SSL_HEADER must be 1 behind the production HTTPS reverse proxy."
}

Require-HttpsOriginList -Name "CSRF_TRUSTED_ORIGINS" | Out-Null

Require-Env "SWIMCRM_RUNTIME_DIR" | Out-Null
Assert-ProductionPathOutsideRepo -Name "SWIMCRM_RUNTIME_DIR" `
    -Value ([Environment]::GetEnvironmentVariable("SWIMCRM_RUNTIME_DIR", "Process")) -RepoRoot $RepoRoot
if ([Environment]::GetEnvironmentVariable("STATIC_ROOT", "Process")) {
    Assert-ProductionPathOutsideRepo -Name "STATIC_ROOT" `
        -Value ([Environment]::GetEnvironmentVariable("STATIC_ROOT", "Process")) -RepoRoot $RepoRoot
}
if ([Environment]::GetEnvironmentVariable("MEDIA_ROOT", "Process")) {
    Assert-ProductionPathOutsideRepo -Name "MEDIA_ROOT" `
        -Value ([Environment]::GetEnvironmentVariable("MEDIA_ROOT", "Process")) -RepoRoot $RepoRoot
}
Write-Host "Runtime path settings passed."

Assert-ProductionValue -Name "POSTGRES_DB" -Value (Require-Env "POSTGRES_DB")
Assert-ProductionValue -Name "POSTGRES_USER" -Value (Require-Env "POSTGRES_USER")
Assert-ProductionPassword -Name "POSTGRES_PASSWORD" -Value (Require-Env "POSTGRES_PASSWORD")
Require-Env "POSTGRES_HOST" | Out-Null
Require-Env "POSTGRES_PORT" | Out-Null
Write-Host "PostgreSQL production settings passed."

Assert-ProductionPathOutsideRepo -Name "BACKUP_DIR" -Value (Require-Env "BACKUP_DIR") -RepoRoot $RepoRoot
Require-Env "CELERY_BROKER_URL" | Out-Null
Require-Env "CELERY_RESULT_BACKEND" | Out-Null
Write-Host "Celery production settings passed."

$bridgeToken = Require-Env "NOCOBASE_BRIDGE_TOKEN"
$configToken = Require-Env "NOCOBASE_CONFIG_TOKEN"
Assert-RealProductionSecret -Name "NOCOBASE_BRIDGE_TOKEN" -Value $bridgeToken -MinLength 32
Assert-RealProductionSecret -Name "NOCOBASE_CONFIG_TOKEN" -Value $configToken -MinLength 32
Require-Env "NOCOBASE_APP_ENV" | Out-Null
if ([Environment]::GetEnvironmentVariable("NOCOBASE_APP_ENV", "Process") -notin @("prod", "production")) {
    throw "NOCOBASE_APP_ENV must be production or prod."
}
$nocobaseAppKey = Require-Env "NOCOBASE_APP_KEY"
Assert-RealProductionSecret -Name "NOCOBASE_APP_KEY" -Value $nocobaseAppKey -MinLength 32
Assert-ProductionPathOutsideRepo -Name "NOCOBASE_APP_ROOT" -Value (Require-Env "NOCOBASE_APP_ROOT") -RepoRoot $RepoRoot
Require-Env "NOCOBASE_APP_PORT" | Out-Null
Require-Env "NOCOBASE_DB_HOST" | Out-Null
Require-Env "NOCOBASE_DB_PORT" | Out-Null
Assert-ProductionValue -Name "NOCOBASE_DB_DATABASE" -Value (Require-Env "NOCOBASE_DB_DATABASE")
Assert-ProductionValue -Name "NOCOBASE_DB_USER" -Value (Require-Env "NOCOBASE_DB_USER")
Assert-ProductionPassword -Name "NOCOBASE_DB_PASSWORD" -Value (Require-Env "NOCOBASE_DB_PASSWORD")
Require-Env "NOCOBASE_ROOT_USERNAME" | Out-Null
Require-Env "NOCOBASE_ROOT_EMAIL" | Out-Null
$nocobaseRootPassword = Require-Env "NOCOBASE_ROOT_PASSWORD"
Assert-RealProductionSecret -Name "NOCOBASE_ROOT_PASSWORD" -Value $nocobaseRootPassword -MinLength 32
Assert-ProductionPathOutsideRepo -Name "NOCOBASE_STORAGE_DIR" -Value (Require-Env "NOCOBASE_STORAGE_DIR") -RepoRoot $RepoRoot
Write-Host "NocoBase production settings passed."
Write-Host "HTTPS reverse-proxy settings passed."

Push-Location $BackendDir
try {
    & $Python "manage.py" "check" "--deploy"
    if ($LASTEXITCODE -ne 0) {
        throw "Production deploy check failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

Write-Host "Production environment check passed."

