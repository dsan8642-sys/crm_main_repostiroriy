[CmdletBinding()]
param(
    [switch]$Postgres,
    [switch]$SkipFrontendInstall,
    [switch]$SkipFrontendAudit,
    [switch]$SkipFrontendBrowserInstall,
    [switch]$SkipFrontendSmoke
)

$ErrorActionPreference = "Stop"

$BackendArgs = @()
if ($Postgres) {
    $BackendArgs += "-Postgres"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "release-check-backend.ps1") @BackendArgs
if ($LASTEXITCODE -ne 0) {
    throw "Backend release checks failed with exit code $LASTEXITCODE"
}

$FrontendArgs = @()
if ($SkipFrontendInstall) {
    $FrontendArgs += "-SkipInstall"
}
if ($SkipFrontendAudit) {
    $FrontendArgs += "-SkipAudit"
}
if ($SkipFrontendBrowserInstall) {
    $FrontendArgs += "-SkipBrowserInstall"
}
if ($SkipFrontendSmoke) {
    $FrontendArgs += "-SkipSmoke"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-frontend-release.ps1") @FrontendArgs
if ($LASTEXITCODE -ne 0) {
    throw "Frontend release checks failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Full-stack release checks passed."
