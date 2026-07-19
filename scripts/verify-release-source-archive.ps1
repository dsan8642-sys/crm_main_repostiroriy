[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Manifest
)

$ErrorActionPreference = "Stop"

$requiredArchiveEntries = @(
    "package.json",
    "package-lock.json",
    "frontend/package.json",
    "frontend/package-lock.json"
)
$blockedArchivePrefixes = @(
    ".git/",
    ".codebase-memory/",
    ".runtime/",
    ".nocobase/",
    ".nocobase-logs/",
    ".npm-cache/",
    ".yarn-cache/",
    "node_modules/",
    "frontend/node_modules/",
    "frontend/dist/",
    "frontend/test-results/",
    "frontend/playwright-report/",
    "swimcrm/.venv/",
    "swimcrm-hybrid/",
    "backups/",
    "releases/",
    "dist/"
)
$blockedArchiveNames = @(
    ".env",
    "PRODUCTION_CUTOVER_EVIDENCE.json",
    "PRODUCTION_CUTOVER_EVIDENCE.draft.json",
    "RELEASE_HANDOFF.json",
    "RELEASE_BACKLOG_TEMP.md",
    "swimcrm.zip",
    "db.sqlite3"
)
$blockedArchiveExtensions = @(
    ".sqlite3",
    ".sqlite3-journal",
    ".dump",
    ".zip"
)

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

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    foreach ($requiredEntry in $requiredArchiveEntries) {
        if ($entries -notcontains $requiredEntry) {
            throw "Release source archive is missing required entry: $requiredEntry"
        }
    }
    foreach ($entry in $entries) {
        foreach ($prefix in $blockedArchivePrefixes) {
            if ($entry.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Release source archive contains blocked runtime/generated entry: $entry"
            }
        }

        $entryName = Split-Path -Leaf $entry
        if ($blockedArchiveNames -contains $entryName) {
            throw "Release source archive contains blocked file: $entry"
        }
        foreach ($extension in $blockedArchiveExtensions) {
            if ($entryName.EndsWith($extension, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Release source archive contains blocked file extension: $entry"
            }
        }
    }
}
finally {
    $zip.Dispose()
}

Write-Host "Release source archive manifest verified."
Write-Host "Release source archive contents verified."
Write-Host "commit_sha: $($data.commit_sha)"
Write-Host "archive_sha256: $actualHash"
