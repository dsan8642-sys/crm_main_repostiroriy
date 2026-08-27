[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Manifest
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProvenanceName = "RELEASE_PROVENANCE.json"

function Get-LineListSha256 {
    param([string[]]$Lines)

    [string[]]$sortedLines = @($Lines)
    [Array]::Sort($sortedLines, [StringComparer]::Ordinal)
    $text = ($sortedLines -join "`n") + "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $sha.Dispose()
    }
}

function Get-StreamSha256 {
    param([System.IO.Stream]$Stream)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($Stream) | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $sha.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    throw "Release artifact manifest does not exist: $Manifest"
}
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$manifestDir = Split-Path -Parent $manifestPath
$data = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if ($data.artifact_type -ne "swimcrm_deployment_bundle" -or [int]$data.format_version -ne 1) {
    throw "Unsupported release artifact type or format version."
}
if (-not ($data.commit_sha -match "^[0-9a-f]{40}$")) {
    throw "Release artifact commit_sha must be a lowercase 40-character git SHA."
}
if (-not ($data.archive_sha256 -match "^[0-9a-f]{64}$")) {
    throw "Release artifact archive_sha256 must be a lowercase SHA-256 hash."
}
if (-not ($data.artifact_file_list_sha256 -match "^[0-9a-f]{64}$")) {
    throw "Release artifact file-list hash is invalid."
}
if (-not ($data.source_tracked_file_list_sha256 -match "^[0-9a-f]{64}$")) {
    throw "Release artifact source file-list hash is invalid."
}
if ($data.source_tree -ne "clean") {
    throw "Release artifact source_tree must be clean."
}

$currentCommit = (& git -C $RepoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -eq 0 -and $currentCommit -ne $data.commit_sha) {
    throw "Release artifact commit_sha does not match current HEAD."
}

$archivePath = [string]$data.archive
if (-not [System.IO.Path]::IsPathRooted($archivePath)) {
    $archivePath = Join-Path $manifestDir $archivePath
}
elseif (-not (Test-Path -LiteralPath $archivePath)) {
    $archivePath = Join-Path $manifestDir (Split-Path -Leaf $archivePath)
}
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Release artifact archive does not exist: $archivePath"
}

$actualArchiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualArchiveHash -ne $data.archive_sha256) {
    throw "Release artifact SHA-256 mismatch."
}

$trackedEntries = @(
    & git -C $RepoRoot -c core.quotepath=false ls-tree -r --name-only HEAD |
        ForEach-Object { $_.Replace("\", "/") } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Sort-Object
)
if ($trackedEntries.Count -ne [int]$data.source_tracked_file_count) {
    throw "Release artifact source tracked-file count mismatch."
}
if ((Get-LineListSha256 -Lines $trackedEntries) -ne $data.source_tracked_file_list_sha256) {
    throw "Release artifact source tracked-file list mismatch."
}

$blockedPrefixes = @(
    ".git/",
    "node_modules/",
    "frontend/node_modules/",
    "swimcrm/.venv/",
    "backups/",
    "releases/"
)
$blockedNames = @(".env", "db.sqlite3", "PRODUCTION_CUTOVER_EVIDENCE.json")

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @(
        $zip.Entries |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
            ForEach-Object { $_.FullName.Replace("\", "/") } |
            Sort-Object
    )
    if ($entries.Count -ne [int]$data.artifact_file_count) {
        throw "Release artifact file count mismatch."
    }
    if ((Get-LineListSha256 -Lines $entries) -ne $data.artifact_file_list_sha256) {
        throw "Release artifact file-list hash mismatch."
    }
    foreach ($required in @("frontend/dist/index.html", $ProvenanceName)) {
        if ($entries -notcontains $required) {
            throw "Release artifact is missing required entry: $required"
        }
    }
    foreach ($entry in $entries) {
        foreach ($prefix in $blockedPrefixes) {
            if ($entry.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Release artifact contains blocked entry: $entry"
            }
        }
        if ($blockedNames -contains (Split-Path -Leaf $entry)) {
            throw "Release artifact contains blocked file: $entry"
        }
    }

    $missingSource = @($trackedEntries | Where-Object { $entries -notcontains $_ })
    $unexpected = @(
        $entries | Where-Object {
            $trackedEntries -notcontains $_ -and
            -not $_.StartsWith("frontend/dist/", [System.StringComparison]::Ordinal) -and
            $_ -ne $ProvenanceName
        }
    )
    if ($missingSource.Count -gt 0 -or $unexpected.Count -gt 0) {
        throw "Release artifact source contents do not match git HEAD."
    }

    $provenanceEntry = $zip.GetEntry($ProvenanceName)
    $reader = [System.IO.StreamReader]::new($provenanceEntry.Open(), [System.Text.Encoding]::UTF8)
    try {
        $provenance = $reader.ReadToEnd() | ConvertFrom-Json
    }
    finally {
        $reader.Dispose()
    }
    if ($provenance.artifact_type -ne $data.artifact_type -or
        $provenance.commit_sha -ne $data.commit_sha -or
        $provenance.source.tracked_file_list_sha256 -ne $data.source_tracked_file_list_sha256) {
        throw "Embedded release provenance does not match the external manifest."
    }
    if ([int]$provenance.frontend_dist.file_count -ne [int]$data.frontend_dist_file_count) {
        throw "Embedded frontend dist count does not match the external manifest."
    }
    foreach ($distFile in $provenance.frontend_dist.files) {
        $entry = $zip.GetEntry([string]$distFile.path)
        if ($null -eq $entry) {
            throw "Release artifact is missing declared frontend file: $($distFile.path)"
        }
        $entryStream = $entry.Open()
        try {
            $actualHash = Get-StreamSha256 -Stream $entryStream
        }
        finally {
            $entryStream.Dispose()
        }
        if ($actualHash -ne $distFile.sha256) {
            throw "Frontend dist SHA-256 mismatch: $($distFile.path)"
        }
    }
}
finally {
    $zip.Dispose()
}

Write-Host "Immutable release artifact verified."
Write-Host "commit_sha: $($data.commit_sha)"
Write-Host "archive_sha256: $actualArchiveHash"
Write-Host "artifact_file_count: $($entries.Count)"
Write-Host "artifact_file_list_sha256: $($data.artifact_file_list_sha256)"
Write-Host "frontend_dist_file_count: $($data.frontend_dist_file_count)"
