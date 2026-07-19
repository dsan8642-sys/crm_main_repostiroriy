[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
$Blueprint = Join-Path $RepoRoot "docs\NOCOBASE_FIRST_SCREENS.json"
$Verifier = Join-Path $RepoRoot "scripts\verify_nocobase_blueprint.py"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Blueprint)) {
    throw "NocoBase blueprint not found at $Blueprint."
}
if (-not (Test-Path -LiteralPath $Verifier)) {
    throw "NocoBase blueprint verifier not found at $Verifier."
}

Push-Location $BackendDir
try {
    & $Python $Verifier $Blueprint
    if ($LASTEXITCODE -ne 0) {
        throw "NocoBase blueprint verification failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
