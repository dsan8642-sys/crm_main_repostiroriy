[CmdletBinding()]
param(
    [string]$Output = "",
    [ValidateSet("staging", "production")]
    [string]$Environment = "production",
    [switch]$Force,
    [switch]$LocalBackendPassed,
    [switch]$LocalFullStackPassed
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot "swimcrm\.venv\Scripts\python.exe"
$Generator = Join-Path $RepoRoot "scripts\new_production_cutover_evidence.py"

if ([string]::IsNullOrWhiteSpace($Output)) {
    $Output = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json"
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Generator)) {
    throw "Production cutover evidence generator not found at $Generator."
}

$args = @(
    "--output", $Output,
    "--environment", $Environment
)
if ($Force) {
    $args += "--force"
}
if ($LocalBackendPassed) {
    $args += "--local-backend-passed"
}
if ($LocalFullStackPassed) {
    $args += "--local-full-stack-passed"
}

& $Python $Generator @args
if ($LASTEXITCODE -ne 0) {
    throw "Production cutover evidence draft generation failed with exit code $LASTEXITCODE."
}
