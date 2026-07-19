[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Manifest
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Manifest)) {
    throw "Release source archive manifest does not exist: $Manifest"
}

$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$manifestDir = Split-Path -Parent $manifestPath
$data = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$RepoRoot = Split-Path -Parent $PSScriptRoot
$currentCommit = ""
$currentShortSha = ""

try {
    & git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $currentCommit = (& git -C $RepoRoot rev-parse HEAD).Trim()
        $currentShortSha = (& git -C $RepoRoot rev-parse --short=12 HEAD).Trim()
    }
}
catch {
    $currentCommit = ""
    $currentShortSha = ""
}

if (-not ($data.commit_sha -match "^[0-9a-f]{40}$")) {
    throw "Release source archive manifest commit_sha must be a 40-character lowercase git SHA."
}
if (-not $data.short_sha) {
    throw "Release source archive manifest short_sha is required."
}
if ($currentCommit -and $data.commit_sha -ne $currentCommit) {
    throw "Release source archive manifest commit_sha must match current HEAD."
}
if ($currentShortSha -and $data.short_sha -ne $currentShortSha) {
    throw "Release source archive manifest short_sha must match current HEAD."
}
if ($data.source_tree -ne "clean") {
    throw "Release source archive manifest source_tree must be 'clean'."
}
if (-not $data.archive) {
    throw "Release source archive manifest archive path is required."
}
if (-not ($data.archive_sha256 -match "^[0-9a-f]{64}$")) {
    throw "Release source archive manifest archive_sha256 must be a lowercase SHA256 hash."
}

$archivePath = [string]$data.archive
if (-not [System.IO.Path]::IsPathRooted($archivePath)) {
    $archivePath = Join-Path $manifestDir $archivePath
}
if (-not (Test-Path -LiteralPath $archivePath)) {
    throw "Release source archive file does not exist: $archivePath"
}

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedHash = ([string]$data.archive_sha256).ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Release source archive sha256 mismatch. Expected $expectedHash but got $actualHash."
}

Write-Host "Release source archive manifest verified."
Write-Host "commit_sha: $($data.commit_sha)"
Write-Host "archive_sha256: $actualHash"
