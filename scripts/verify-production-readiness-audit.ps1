[CmdletBinding()]
param(
    [string]$Audit = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot "swimcrm\.venv\Scripts\python.exe"
$Verifier = Join-Path $RepoRoot "scripts\verify_production_readiness_audit.py"
if ([string]::IsNullOrWhiteSpace($Audit)) {
    $Audit = Join-Path $RepoRoot "docs\PRODUCTION_READINESS_AUDIT.json"
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Audit)) {
    throw "Production readiness audit manifest not found at $Audit."
}
if (-not (Test-Path -LiteralPath $Verifier)) {
    throw "Production readiness audit verifier not found at $Verifier."
}

& $Python $Verifier $Audit
if ($LASTEXITCODE -ne 0) {
    throw "Production readiness audit verification failed with exit code $LASTEXITCODE."
}
