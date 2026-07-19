[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipAudit,
    [switch]$SkipBrowserInstall,
    [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$LocalNpmCache = Join-Path $RepoRoot ".npm-cache"

if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "package.json"))) {
    throw "Frontend package.json not found at $FrontendDir."
}

function Invoke-NpmStep {
    param(
        [string]$Name,
        [string[]]$Arguments
    )

    Write-Host ""
    Write-Host "==> $Name"
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Push-Location $FrontendDir
$previousNpmCache = $env:npm_config_cache
try {
    New-Item -ItemType Directory -Force -Path $LocalNpmCache | Out-Null
    $env:npm_config_cache = $LocalNpmCache

    if (-not $SkipInstall) {
        Invoke-NpmStep "Frontend dependency install" @("ci", "--cache", $LocalNpmCache)
    }

    if (-not $SkipAudit) {
        Invoke-NpmStep "Frontend dependency audit" @("audit", "--audit-level=high", "--cache", $LocalNpmCache)
    }

    Invoke-NpmStep "Frontend production build" @("run", "build")

    if (-not $SkipSmoke) {
        if (-not $SkipBrowserInstall) {
            Invoke-NpmStep "Frontend Playwright browser install" @("exec", "playwright", "install", "chromium")
        }

        Invoke-NpmStep "Frontend Playwright smoke tests" @("run", "test:smoke")
    }
}
finally {
    if ($null -eq $previousNpmCache) {
        Remove-Item Env:\npm_config_cache -ErrorAction SilentlyContinue
    }
    else {
        $env:npm_config_cache = $previousNpmCache
    }
    Pop-Location
}

Write-Host ""
Write-Host "Frontend release checks passed."
