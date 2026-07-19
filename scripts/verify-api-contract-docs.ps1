[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot "swimcrm\.venv\Scripts\python.exe"
$Verifier = Join-Path $RepoRoot "scripts\verify_api_contract_docs.py"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Verifier)) {
    throw "API contract docs verifier not found at $Verifier."
}

& $Python $Verifier
if ($LASTEXITCODE -ne 0) {
    throw "API contract docs verification failed with exit code $LASTEXITCODE."
}
