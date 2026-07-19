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

function Get-LineListSha256 {
    param([string[]]$Lines)

    $text = (($Lines | Sort-Object) -join "`n") + "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $sha.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $Manifest)) {
    throw "Release source archive manifest does not exist: $Manifest"
}

$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$manifestDir = Split-Path -Parent $manifestPath
$data = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$RepoRoot = Split-Path -Parent $PSScriptRoot
$currentCommit = ""
$currentShortSha = ""
$expectedTrackedEntries = @()

try {
    & git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $currentCommit = (& git -C $RepoRoot rev-parse HEAD).Trim()
        $currentShortSha = (& git -C $RepoRoot rev-parse --short=12 HEAD).Trim()
        $expectedTrackedEntries = @(
            & git -C $RepoRoot -c core.quotepath=false ls-tree -r --name-only HEAD |
                ForEach-Object { $_.Replace("\", "/") } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                Sort-Object
        )
    }
}
catch {
    $currentCommit = ""
    $currentShortSha = ""
    $expectedTrackedEntries = @()
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
if (-not ($data.tracked_file_count -is [int]) -and -not ($data.tracked_file_count -is [long])) {
    throw "Release source archive manifest tracked_file_count must be an integer."
}
if (-not ($data.tracked_file_list_sha256 -match "^[0-9a-f]{64}$")) {
    throw "Release source archive manifest tracked_file_list_sha256 must be a lowercase SHA256 hash."
}

$archivePath = [string]$data.archive
if (-not [System.IO.Path]::IsPathRooted($archivePath)) {
    $archivePath = Join-Path $manifestDir $archivePath
}
elseif (-not (Test-Path -LiteralPath $archivePath)) {
    $siblingArchivePath = Join-Path $manifestDir (Split-Path -Leaf $archivePath)
    if (Test-Path -LiteralPath $siblingArchivePath) {
        $archivePath = $siblingArchivePath
    }
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
    $fileEntries = @(
        $zip.Entries |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
            ForEach-Object { $_.FullName.Replace("\", "/") } |
            Sort-Object
    )
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
    if ($fileEntries.Count -ne [int]$data.tracked_file_count) {
        throw "Release source archive tracked file count mismatch. Expected $($data.tracked_file_count) but got $($fileEntries.Count)."
    }
    $actualFileListHash = Get-LineListSha256 -Lines $fileEntries
    $expectedFileListHash = ([string]$data.tracked_file_list_sha256).ToLowerInvariant()
    if ($actualFileListHash -ne $expectedFileListHash) {
        throw "Release source archive tracked file list sha256 mismatch. Expected $expectedFileListHash but got $actualFileListHash."
    }
    if ($expectedTrackedEntries.Count -gt 0) {
        $missingTrackedEntries = @($expectedTrackedEntries | Where-Object { $fileEntries -notcontains $_ })
        $unexpectedArchiveEntries = @($fileEntries | Where-Object { $expectedTrackedEntries -notcontains $_ })
        if ($missingTrackedEntries.Count -gt 0 -or $unexpectedArchiveEntries.Count -gt 0) {
            $details = @()
            if ($missingTrackedEntries.Count -gt 0) {
                $details += "missing tracked entries: " + (($missingTrackedEntries | Select-Object -First 20) -join ", ")
            }
            if ($unexpectedArchiveEntries.Count -gt 0) {
                $details += "unexpected archive entries: " + (($unexpectedArchiveEntries | Select-Object -First 20) -join ", ")
            }
            throw "Release source archive file list must match git ls-tree HEAD. $($details -join "; ")"
        }
    }
}
finally {
    $zip.Dispose()
}

Write-Host "Release source archive manifest verified."
Write-Host "Release source archive contents verified."
Write-Host "Release source archive tracked file list verified."
Write-Host "commit_sha: $($data.commit_sha)"
Write-Host "archive_path: $archivePath"
Write-Host "archive_sha256: $actualHash"
Write-Host "tracked_file_count: $($fileEntries.Count)"
Write-Host "tracked_file_list_sha256: $actualFileListHash"
