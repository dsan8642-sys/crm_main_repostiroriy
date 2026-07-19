[CmdletBinding()]
param(
    [string]$OutDir = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReleaseTreeCheck = Join-Path $RepoRoot "scripts\verify-release-tree.ps1"

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot "releases"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutDir)) {
    $OutDir = Join-Path $RepoRoot $OutDir
}

& git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Release source archive requires a git work tree."
}

$status = & git -C $RepoRoot status --porcelain
if ($status) {
    throw "Release source archive requires a clean git work tree. Commit or stash local changes first."
}

$commitSha = (& git -C $RepoRoot rev-parse HEAD).Trim()
$shortSha = (& git -C $RepoRoot rev-parse --short=12 HEAD).Trim()
$branch = (& git -C $RepoRoot branch --show-current).Trim()

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ReleaseTreeCheck -SourceOnly -RequireTrackedReleaseFiles
if ($LASTEXITCODE -ne 0) {
    throw "Release source tree verification failed with exit code $LASTEXITCODE."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$archivePath = Join-Path $OutDir ("swimcrm-release-{0}.zip" -f $shortSha)
$manifestPath = Join-Path $OutDir ("swimcrm-release-{0}.manifest.json" -f $shortSha)

foreach ($path in @($archivePath, $manifestPath)) {
    if ((Test-Path -LiteralPath $path) -and -not $Force) {
        throw "Refusing to overwrite existing release artifact: $path. Pass -Force to overwrite it."
    }
}

& git -C $RepoRoot archive --format zip --output $archivePath HEAD
if ($LASTEXITCODE -ne 0) {
    throw "git archive failed with exit code $LASTEXITCODE."
}

$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()

$manifest = [ordered]@{
    created_at = (Get-Date).ToString("o")
    commit_sha = $commitSha
    short_sha = $shortSha
    branch = $branch
    source_tree = "clean"
    archive = (Resolve-Path -LiteralPath $archivePath).Path
    archive_sha256 = $archiveHash
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Release source archive written: $archivePath"
Write-Host "Release source manifest written: $manifestPath"
Write-Host "Release source archive sha256: $archiveHash"
