[CmdletBinding()]
param(
    [string]$Workflow = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot "swimcrm\.venv\Scripts\python.exe"
$Verifier = Join-Path $RepoRoot "scripts\verify_ci_release_workflow.py"
if ([string]::IsNullOrWhiteSpace($Workflow)) {
    $Workflow = Join-Path $RepoRoot ".github\workflows\release-check.yml"
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python venv not found at $Python."
}
if (-not (Test-Path -LiteralPath $Verifier)) {
    throw "CI release workflow verifier not found at $Verifier."
}
if (-not (Test-Path -LiteralPath $Workflow)) {
    throw "CI release workflow not found at $Workflow."
}

& $Python $Verifier $Workflow
if ($LASTEXITCODE -ne 0) {
    throw "CI release workflow verification failed with exit code $LASTEXITCODE."
}
