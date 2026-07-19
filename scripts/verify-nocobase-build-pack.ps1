[CmdletBinding()]
param(
    [string]$BuildPackPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

if ([string]::IsNullOrWhiteSpace($BuildPackPath)) {
    $BuildPackPath = Join-Path $RepoRoot "docs\NOCOBASE_SCREEN_BUILD_PACK.json"
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python."
}

Push-Location $BackendDir
try {
    & $Python (Join-Path $RepoRoot "scripts\verify_nocobase_build_pack.py") $BuildPackPath
    if ($LASTEXITCODE -ne 0) {
        throw "NocoBase screen build pack verification failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
