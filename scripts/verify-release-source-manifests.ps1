[CmdletBinding()]
param(
    [switch]$RequireTracked
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot "swimcrm\.venv\Scripts\python.exe"
$Verifier = Join-Path $RepoRoot "scripts\verify_release_source_manifests.py"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Verifier)) {
    throw "Release source manifest verifier not found at $Verifier."
}

$args = @()
if ($RequireTracked) {
    $args += "--require-tracked"
}

& $Python $Verifier @args
if ($LASTEXITCODE -ne 0) {
    throw "Release source manifest verification failed with exit code $LASTEXITCODE."
}
