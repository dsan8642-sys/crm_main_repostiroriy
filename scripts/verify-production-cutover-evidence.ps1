[CmdletBinding()]
param(
    [string]$Evidence = "",
    [switch]$AllowExample,
    [switch]$AllowStaging,
    [switch]$RequireCurrentHead
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot "swimcrm\.venv\Scripts\python.exe"
$Verifier = Join-Path $RepoRoot "scripts\verify_production_cutover_evidence.py"
if ([string]::IsNullOrWhiteSpace($Evidence)) {
    $Evidence = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.json"
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Verifier)) {
    throw "Production cutover evidence verifier not found at $Verifier."
}
if (-not (Test-Path -LiteralPath $Evidence)) {
    throw "Production cutover evidence manifest not found at $Evidence."
}

$args = @()
if ($AllowExample) {
    $args += "--allow-example"
}
if ($AllowStaging) {
    $args += "--allow-staging"
}
if ($RequireCurrentHead) {
    $expectedCommit = ((& git -C $RepoRoot rev-parse HEAD) -join "").Trim()
    if ($LASTEXITCODE -ne 0 -or -not ($expectedCommit -match "^[0-9a-f]{40}$")) {
        throw "RequireCurrentHead needs a valid git HEAD."
    }
    $args += "--expected-commit-sha"
    $args += $expectedCommit
}
$args += $Evidence

& $Python $Verifier @args
if ($LASTEXITCODE -ne 0) {
    throw "Production cutover evidence verification failed with exit code $LASTEXITCODE."
}
