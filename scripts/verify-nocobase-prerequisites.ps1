[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalYarn = Join-Path $RepoRoot "node_modules\.bin\yarn.cmd"
$RootPackageJson = Join-Path $RepoRoot "package.json"
$RootPackageLock = Join-Path $RepoRoot "package-lock.json"

function Invoke-VersionCommand {
    param(
        [string]$Command,
        [string[]]$Arguments = @()
    )

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $Command @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    catch {
        $output = @($_.Exception.Message)
        $exitCode = 1
    }
    finally {
        $ErrorActionPreference = $previous
    }

    return @{
        exit_code = $exitCode
        output = ($output -join "`n").Trim()
    }
}

function Get-SemverParts {
    param([string]$VersionText)

    if ($VersionText -notmatch "v?(\d+)\.(\d+)\.(\d+)") {
        throw "Could not parse semantic version from '$VersionText'."
    }

    return @{
        major = [int]$Matches[1]
        minor = [int]$Matches[2]
        patch = [int]$Matches[3]
    }
}

function Assert-ExactPackageVersion {
    param(
        [string]$Path,
        [string]$PackageName,
        [string]$ExpectedVersion
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required package manifest not found: $Path"
    }
    $text = Get-Content -LiteralPath $Path -Raw
    $escapedPackage = [regex]::Escape($PackageName)
    $escapedVersion = [regex]::Escape($ExpectedVersion)
    if ($text -notmatch "`"$escapedPackage`"\s*:\s*`"$escapedVersion`"") {
        throw "$PackageName must be pinned to exact version $ExpectedVersion in $Path."
    }
    if ($text -match "`"$escapedPackage`"\s*:\s*`"[\^~<>=*]") {
        throw "$PackageName must not use a floating semver range in $Path."
    }
}

Assert-ExactPackageVersion -Path $RootPackageJson -PackageName "@nocobase/cli" -ExpectedVersion "2.1.24"
Assert-ExactPackageVersion -Path $RootPackageJson -PackageName "yarn" -ExpectedVersion "1.22.22"
Assert-ExactPackageVersion -Path $RootPackageLock -PackageName "@nocobase/cli" -ExpectedVersion "2.1.24"
Assert-ExactPackageVersion -Path $RootPackageLock -PackageName "yarn" -ExpectedVersion "1.22.22"
Write-Host "NocoBase tooling pins passed: @nocobase/cli 2.1.24, Yarn 1.22.22"

$node = Invoke-VersionCommand -Command "node.exe" -Arguments @("--version")
if ($node.exit_code -ne 0) {
    throw "Node.js is required for NocoBase but was not found. Output: $($node.output)"
}
$nodeVersion = Get-SemverParts -VersionText $node.output
if ($nodeVersion.major -lt 22) {
    throw "NocoBase requires Node.js 22 or newer. Found: $($node.output)"
}
Write-Host "NocoBase prerequisite passed: Node.js $($node.output)"

$npm = Invoke-VersionCommand -Command "npm.cmd" -Arguments @("--version")
if ($npm.exit_code -ne 0) {
    throw "npm is required to install/recreate the NocoBase runtime. Output: $($npm.output)"
}
Write-Host "NocoBase prerequisite passed: npm $($npm.output)"

$yarnCommand = if (Test-Path -LiteralPath $LocalYarn) { $LocalYarn } else { "yarn.cmd" }
$yarn = Invoke-VersionCommand -Command $yarnCommand -Arguments @("--version")
if ($yarn.exit_code -ne 0) {
    throw "Yarn 1.x is required for NocoBase. Install dependencies with npm install or install Yarn 1.x globally. Output: $($yarn.output)"
}
$yarnVersion = Get-SemverParts -VersionText $yarn.output
if ($yarnVersion.major -ne 1) {
    throw "NocoBase requires Yarn 1.x. Found: $($yarn.output)"
}
Write-Host "NocoBase prerequisite passed: Yarn $($yarn.output)"

Write-Host "NocoBase prerequisite checks passed."
