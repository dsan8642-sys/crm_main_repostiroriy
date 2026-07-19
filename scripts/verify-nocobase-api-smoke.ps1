[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python."
}

Push-Location $BackendDir
try {
    & $Python "manage.py" "test" "tests.test_nocobase_bridge"
    if ($LASTEXITCODE -ne 0) {
        throw "NocoBase API smoke tests failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
