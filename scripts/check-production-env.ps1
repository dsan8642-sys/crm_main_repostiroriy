[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

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

