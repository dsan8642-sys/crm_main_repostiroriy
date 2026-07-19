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

function Reject-PlaceholderSecret {
    param([string]$Name, [string]$Value)
    if ($Value.Length -lt 16 -or $Value -match "dev-insecure|release-check|change-me|example|Admin!2026pass") {
        throw "$Name must be a real production secret, not a placeholder."
    }
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
if ($secret.Length -lt 50 -or $secret -match "dev-insecure|release-check|change-me|example") {
    throw "SECRET_KEY must be a real production secret, not a placeholder."
}

$allowedHosts = Require-Env "ALLOWED_HOSTS"
if ($allowedHosts -match "\*" -or $allowedHosts -match "localhost|127\.0\.0\.1") {
    throw "ALLOWED_HOSTS must contain explicit production hostnames only."
}

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

Assert-ProductionValue -Name "POSTGRES_DB" -Value (Require-Env "POSTGRES_DB")
Assert-ProductionValue -Name "POSTGRES_USER" -Value (Require-Env "POSTGRES_USER")
Assert-ProductionPassword -Name "POSTGRES_PASSWORD" -Value (Require-Env "POSTGRES_PASSWORD")
Require-Env "POSTGRES_HOST" | Out-Null
Require-Env "POSTGRES_PORT" | Out-Null

Assert-ProductionPathOutsideRepo -Name "BACKUP_DIR" -Value (Require-Env "BACKUP_DIR") -RepoRoot $RepoRoot
Require-Env "CELERY_BROKER_URL" | Out-Null
Require-Env "CELERY_RESULT_BACKEND" | Out-Null

$bridgeToken = Require-Env "NOCOBASE_BRIDGE_TOKEN"
$configToken = Require-Env "NOCOBASE_CONFIG_TOKEN"
Reject-PlaceholderSecret -Name "NOCOBASE_BRIDGE_TOKEN" -Value $bridgeToken
Reject-PlaceholderSecret -Name "NOCOBASE_CONFIG_TOKEN" -Value $configToken
Require-Env "NOCOBASE_APP_ENV" | Out-Null
if ([Environment]::GetEnvironmentVariable("NOCOBASE_APP_ENV", "Process") -notin @("prod", "production")) {
    throw "NOCOBASE_APP_ENV must be production or prod."
}
$nocobaseAppKey = Require-Env "NOCOBASE_APP_KEY"
Reject-PlaceholderSecret -Name "NOCOBASE_APP_KEY" -Value $nocobaseAppKey
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
Reject-PlaceholderSecret -Name "NOCOBASE_ROOT_PASSWORD" -Value $nocobaseRootPassword
Assert-ProductionPathOutsideRepo -Name "NOCOBASE_STORAGE_DIR" -Value (Require-Env "NOCOBASE_STORAGE_DIR") -RepoRoot $RepoRoot

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

