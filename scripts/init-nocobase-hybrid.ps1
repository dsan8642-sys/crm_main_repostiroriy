param(
    [string]$EnvName = "swimcrm-hybrid",
    [string]$AppDir = $(Join-Path (Split-Path -Parent $PSScriptRoot) "nocobase-app"),
    [int]$Port = 13000,
    [switch]$RunInit
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Get-CommandVersion {
    param([string]$Name)

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
$nbVersion = Get-CommandVersion "nb"

Write-Host "NocoBase hybrid bootstrap check"
Write-Host "Repo root: $RepoRoot"
Write-Host "Env name: $EnvName"
Write-Host "App dir: $AppDir"
Write-Host "Port: $Port"
Write-Host ""

Write-Host "Detected tools:"
Write-Host "  node: $($nodeVersion ?? '<missing>')"
Write-Host "  yarn: $($yarnVersion ?? '<missing>')"
Write-Host "  nb:   $($nbVersion ?? '<missing>')"
Write-Host ""

Write-Host "Official NocoBase prerequisites:"
Write-Host "  - Node.js >= 22"
Write-Host "  - Yarn 1.x"
Write-Host "  - @nocobase/cli installed"
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
    Write-Host "  1. npm install -g @nocobase/cli"
    Write-Host "  2. nb init --ui --env $EnvName"
    Write-Host "  3. Open http://localhost:$Port after startup"
    Write-Host ""
    Write-Host "Run this script with -RunInit after the 'nb' command is available."
    exit 0
}

if (-not (Get-Command "nb" -ErrorAction SilentlyContinue)) {
    throw "The 'nb' command is not available. Install @nocobase/cli first."
}

Push-Location $AppDir
try {
    & nb init --ui --env $EnvName
} finally {
    Pop-Location
}
