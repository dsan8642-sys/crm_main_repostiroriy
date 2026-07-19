param(
    [string]$EnvName = "swimcrm-hybrid",
    [string]$AppDir = $(Join-Path (Split-Path -Parent $PSScriptRoot) "swimcrm-hybrid"),
    [int]$Port = 13000,
    [switch]$RunInit
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalNb = Join-Path $RepoRoot "node_modules\.bin\nb.cmd"

function Format-DetectedVersion {
    param(
        [object]$Version,
        [string]$Fallback
    )

    if ($null -eq $Version -or [string]::IsNullOrWhiteSpace([string]$Version)) {
        return $Fallback
    }
    return $Version
}

function Get-CommandVersion {
    param(
        [string]$Name,
        [string]$Path = $null
    )

    if ($Path) {
        if (-not (Test-Path -LiteralPath $Path)) {
            return $null
        }
        try {
            return & $Path --version 2>$null
        } catch {
            return "<installed>"
        }
    }

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        return $null
    }
    try {
        return & $cmd.Source --version 2>$null
    } catch {
        return "<installed>"
    }
}

$nodeVersion = Get-CommandVersion "node"
$yarnVersion = Get-CommandVersion "yarn"
$nbVersion = Get-CommandVersion "nb" -Path $LocalNb

Write-Host "NocoBase hybrid bootstrap check"
Write-Host "Repo root: $RepoRoot"
Write-Host "Env name: $EnvName"
Write-Host "App dir: $AppDir"
Write-Host "Port: $Port"
Write-Host ""

Write-Host "Detected tools:"
Write-Host "  node: $(Format-DetectedVersion -Version $nodeVersion -Fallback '<missing>')"
Write-Host "  yarn: $(Format-DetectedVersion -Version $yarnVersion -Fallback '<missing>')"
Write-Host "  nb:   $(Format-DetectedVersion -Version $nbVersion -Fallback '<missing local CLI>')"
Write-Host ""

Write-Host "Official NocoBase prerequisites:"
Write-Host "  - Node.js >= 22"
Write-Host "  - Yarn 1.x"
Write-Host "  - repository-local @nocobase/cli 2.1.24 installed from package-lock.json"
Write-Host ""

if (-not (Test-Path -LiteralPath $AppDir)) {
    New-Item -ItemType Directory -Path $AppDir | Out-Null
}

Write-Host "Recommended wizard values:"
Write-Host "  env identifier: $EnvName"
Write-Host "  app storage dir: $AppDir"
Write-Host "  runtime port: $Port"
Write-Host "  database: dedicated PostgreSQL database for NocoBase"
Write-Host ""

if (-not $RunInit) {
    Write-Host "Dry run complete."
    Write-Host "Next manual steps:"
    Write-Host "  1. npm install"
    Write-Host "  2. .\scripts\init-nocobase-hybrid.cmd -RunInit"
    Write-Host "  3. Open http://localhost:$Port after startup"
    Write-Host ""
    Write-Host "Run this script with -RunInit after the local NocoBase CLI is available."
    exit 0
}

if (-not (Test-Path -LiteralPath $LocalNb)) {
    throw "The repository-local NocoBase CLI was not found at $LocalNb. Run npm install from the repository root first."
}

Push-Location $AppDir
try {
    & $LocalNb init --ui --env $EnvName
} finally {
    Pop-Location
}
