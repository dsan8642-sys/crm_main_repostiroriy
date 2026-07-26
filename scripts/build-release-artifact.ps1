[CmdletBinding()]
param(
    [string]$OutDir = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDist = Join-Path $RepoRoot "frontend\dist"
$ProvenanceName = "RELEASE_PROVENANCE.json"

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot "releases"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutDir)) {
    $OutDir = Join-Path $RepoRoot $OutDir
}

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

function Write-Utf8Json {
    param([string]$Path, [object]$Value)

    $json = $Value | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText(
        $Path,
        $json + "`n",
        [System.Text.UTF8Encoding]::new($false)
    )
}

& git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Release artifact requires a git work tree."
}

$status = & git -C $RepoRoot status --porcelain
if ($status) {
    throw "Release artifact requires a clean git work tree. Commit or stash local changes first."
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDist "index.html") -PathType Leaf)) {
    throw "Built frontend is missing. Run npm ci and npm run build before packaging."
}

$commitSha = (& git -C $RepoRoot rev-parse HEAD).Trim()
$shortSha = (& git -C $RepoRoot rev-parse --short=12 HEAD).Trim()
$branch = ((& git -C $RepoRoot branch --show-current) -join "").Trim()
$commitTimestamp = (& git -C $RepoRoot show -s --format=%cI HEAD).Trim()
$archiveTimestamp = [DateTimeOffset]::Parse($commitTimestamp)
if ($archiveTimestamp.Year -lt 1980) {
    $archiveTimestamp = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
}

$trackedEntries = @(
    & git -C $RepoRoot -c core.quotepath=false ls-tree -r --name-only HEAD |
        ForEach-Object { $_.Replace("\", "/") } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Sort-Object
)
$trackedFileListHash = Get-LineListSha256 -Lines $trackedEntries

$distFiles = @(
    Get-ChildItem -LiteralPath $FrontendDist -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($FrontendDist.Length).TrimStart("\", "/").Replace("\", "/")
            [ordered]@{
                path = "frontend/dist/$relative"
                bytes = $_.Length
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        }
)
if ($distFiles.Count -eq 0) {
    throw "frontend/dist does not contain any files."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$archivePath = Join-Path $OutDir ("swimcrm-release-{0}.zip" -f $shortSha)
$manifestPath = Join-Path $OutDir ("swimcrm-release-{0}.manifest.json" -f $shortSha)
foreach ($path in @($archivePath, $manifestPath)) {
    if ((Test-Path -LiteralPath $path) -and -not $Force) {
        throw "Refusing to overwrite immutable release artifact: $path"
    }
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("swimcrm-release-" + [Guid]::NewGuid().ToString("N"))
$sourceArchive = Join-Path $stagingRoot "source.zip"
$bundleRoot = Join-Path $stagingRoot "bundle"

try {
    New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null
    & git -C $RepoRoot archive --format zip --output $sourceArchive HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "git archive failed with exit code $LASTEXITCODE."
    }
    Expand-Archive -LiteralPath $sourceArchive -DestinationPath $bundleRoot

    $bundleDist = Join-Path $bundleRoot "frontend\dist"
    New-Item -ItemType Directory -Force -Path $bundleDist | Out-Null
    Copy-Item -Path (Join-Path $FrontendDist "*") -Destination $bundleDist -Recurse -Force

    $provenance = [ordered]@{
        format_version = 1
        artifact_type = "swimcrm_deployment_bundle"
        commit_sha = $commitSha
        short_sha = $shortSha
        branch = $branch
        commit_timestamp = $commitTimestamp
        source = [ordered]@{
            tracked_file_count = $trackedEntries.Count
            tracked_file_list_sha256 = $trackedFileListHash
        }
        frontend_dist = [ordered]@{
            file_count = $distFiles.Count
            files = $distFiles
        }
    }
    Write-Utf8Json -Path (Join-Path $bundleRoot $ProvenanceName) -Value $provenance

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    $stream = [System.IO.File]::Open(
        $archivePath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    try {
        $zip = [System.IO.Compression.ZipArchive]::new(
            $stream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            $bundleFiles = @(Get-ChildItem -LiteralPath $bundleRoot -Recurse -File | Sort-Object FullName)
            foreach ($file in $bundleFiles) {
                $relative = $file.FullName.Substring($bundleRoot.Length).TrimStart("\", "/").Replace("\", "/")
                $entry = $zip.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
                $entry.LastWriteTime = $archiveTimestamp
                $input = [System.IO.File]::OpenRead($file.FullName)
                $output = $entry.Open()
                try {
                    $input.CopyTo($output)
                }
                finally {
                    $output.Dispose()
                    $input.Dispose()
                }
            }
        }
        finally {
            $zip.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $readZip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $artifactEntries = @(
            $readZip.Entries |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
                ForEach-Object { $_.FullName.Replace("\", "/") } |
                Sort-Object
        )
    }
    finally {
        $readZip.Dispose()
    }

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest = [ordered]@{
        format_version = 1
        artifact_type = "swimcrm_deployment_bundle"
        commit_sha = $commitSha
        short_sha = $shortSha
        branch = $branch
        commit_timestamp = $commitTimestamp
        source_tree = "clean"
        archive = Split-Path -Leaf $archivePath
        archive_sha256 = $archiveHash
        artifact_file_count = $artifactEntries.Count
        artifact_file_list_sha256 = Get-LineListSha256 -Lines $artifactEntries
        source_tracked_file_count = $trackedEntries.Count
        source_tracked_file_list_sha256 = $trackedFileListHash
        frontend_dist_file_count = $distFiles.Count
        provenance_entry = $ProvenanceName
    }
    Write-Utf8Json -Path $manifestPath -Value $manifest
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
}

Write-Host "Immutable release artifact written: $archivePath"
Write-Host "Release artifact manifest written: $manifestPath"
Write-Host "commit_sha: $commitSha"
Write-Host "archive_sha256: $archiveHash"
Write-Host "artifact_file_count: $($artifactEntries.Count)"
Write-Host "artifact_file_list_sha256: $($manifest.artifact_file_list_sha256)"
Write-Host "frontend_dist_file_count: $($distFiles.Count)"
