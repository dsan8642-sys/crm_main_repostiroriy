[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Manifest,
    [Parameter(Mandatory = $true)]
    [string]$ReleaseDir,
    [switch]$RequireInstalledDependencies
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$SourceArchiveVerifier = Join-Path $RepoRoot "scripts\verify-release-source-archive.ps1"
$DeploymentArchiveVerifier = Join-Path $RepoRoot "scripts\verify-release-artifact.ps1"
$BlockedGeneratedPrefixes = @(
    ".venv/",
    "node_modules/",
    "frontend/node_modules/",
    "frontend/dist/",
    "frontend/test-results/",
    "frontend/playwright-report/",
    "swimcrm/.venv/",
    "staticfiles/",
    "media/",
    "receipts/",
    "backups/",
    "releases/",
    ".runtime/",
    ".npm-cache/",
    ".yarn-cache/"
)

function Resolve-RequiredPath {
    param(
        [string]$Path,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label is required."
    }
    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        $Path = Join-Path $RepoRoot $Path
    }
    return [System.IO.Path]::GetFullPath($Path)
}

function Test-PathInside {
    param([string]$Child, [string]$Parent)

    if ([string]::IsNullOrWhiteSpace($Child) -or [string]::IsNullOrWhiteSpace($Parent)) {
        return $false
    }
    $childPath = [System.IO.Path]::GetFullPath($Child)
    $parentPath = [System.IO.Path]::GetFullPath($Parent)
    return $childPath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $childPath.StartsWith($parentPath.TrimEnd("\") + "\", [System.StringComparison]::OrdinalIgnoreCase)
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

function Get-PortableRelativePath {
    param(
        [string]$Root,
        [string]$Path
    )

    $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd("\") + "\"
    $targetPath = [System.IO.Path]::GetFullPath($Path)
    $rootUri = New-Object System.Uri($rootPath)
    $targetUri = New-Object System.Uri($targetPath)
    return [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($targetUri).ToString()).Replace("/", "\")
}

function Resolve-ArchivePath {
    param(
        [object]$ManifestData,
        [string]$ManifestDir
    )

    $archivePath = [string]$ManifestData.archive
    if ([string]::IsNullOrWhiteSpace($archivePath)) {
        throw "Release source archive manifest archive path is required."
    }
    if (-not [System.IO.Path]::IsPathRooted($archivePath)) {
        $archivePath = Join-Path $ManifestDir $archivePath
    }
    elseif (-not (Test-Path -LiteralPath $archivePath)) {
        $siblingArchivePath = Join-Path $ManifestDir (Split-Path -Leaf $archivePath)
        if (Test-Path -LiteralPath $siblingArchivePath) {
            $archivePath = $siblingArchivePath
        }
    }
    if (-not (Test-Path -LiteralPath $archivePath)) {
        throw "Release source archive file does not exist: $archivePath"
    }
    return [System.IO.Path]::GetFullPath($archivePath)
}

function Get-ZipFileEntries {
    param([string]$ArchivePath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        return @(
            $zip.Entries |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
                ForEach-Object { $_.FullName.Replace("\", "/") } |
                Sort-Object
        )
    }
    finally {
        $zip.Dispose()
    }
}

function Get-ReleaseSourceEntries {
    param([string]$Root)

    return @(
        Get-ChildItem -LiteralPath $Root -Recurse -File -Force |
            ForEach-Object {
                $relative = (Get-PortableRelativePath -Root $Root -Path $_.FullName).Replace("\", "/")
                $isGenerated = $relative -match '(^|/)__pycache__/' -or $relative -match '\.py[co]$'
                foreach ($prefix in $BlockedGeneratedPrefixes) {
                    if ($relative.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                        $isGenerated = $true
                        break
                    }
                }
                if (-not $isGenerated) {
                    $relative
                }
            } |
            Sort-Object
    )
}

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label was not found at $Path."
    }
}

if (-not (Test-Path -LiteralPath $SourceArchiveVerifier)) {
    throw "Release source archive verifier not found at $SourceArchiveVerifier."
}
if (-not (Test-Path -LiteralPath $DeploymentArchiveVerifier)) {
    throw "Deployment archive verifier not found at $DeploymentArchiveVerifier."
}

$manifestPath = Resolve-RequiredPath -Path $Manifest -Label "Manifest"
$releaseDirPath = Resolve-RequiredPath -Path $ReleaseDir -Label "ReleaseDir"

Assert-PathExists -Path $manifestPath -Label "Release source archive manifest"
Assert-PathExists -Path $releaseDirPath -Label "Release directory"

$manifestData = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$isDeploymentBundle = $manifestData.artifact_type -eq "swimcrm_deployment_bundle"
if ($isDeploymentBundle) {
    $BlockedGeneratedPrefixes = @(
        $BlockedGeneratedPrefixes |
            Where-Object { $_ -ne "frontend/dist/" }
    )
}
$archiveVerifier = if ($isDeploymentBundle) {
    $DeploymentArchiveVerifier
}
else {
    $SourceArchiveVerifier
}
$archivePath = Resolve-ArchivePath -ManifestData $manifestData -ManifestDir (Split-Path -Parent $manifestPath)

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $archiveVerifier $manifestPath
if ($LASTEXITCODE -ne 0) {
    throw "Release source archive verification failed with exit code $LASTEXITCODE."
}

$zipEntries = Get-ZipFileEntries -ArchivePath $archivePath
$releaseEntries = Get-ReleaseSourceEntries -Root $releaseDirPath
$missingEntries = @($zipEntries | Where-Object { $releaseEntries -notcontains $_ })
$unexpectedEntries = @($releaseEntries | Where-Object { $zipEntries -notcontains $_ })
if ($missingEntries.Count -gt 0 -or $unexpectedEntries.Count -gt 0) {
    $details = @()
    if ($missingEntries.Count -gt 0) {
        $details += "missing installed source entries: " + (($missingEntries | Select-Object -First 20) -join ", ")
    }
    if ($unexpectedEntries.Count -gt 0) {
        $details += "unexpected installed source entries: " + (($unexpectedEntries | Select-Object -First 20) -join ", ")
    }
    throw "Installed release source tree must match the verified release archive. $($details -join "; ")"
}

$installedFileListHash = Get-LineListSha256 -Lines $releaseEntries
$expectedFileCount = if ($isDeploymentBundle) {
    [int]$manifestData.artifact_file_count
}
else {
    [int]$manifestData.tracked_file_count
}
$expectedFileListHash = if ($isDeploymentBundle) {
    [string]$manifestData.artifact_file_list_sha256
}
else {
    [string]$manifestData.tracked_file_list_sha256
}
if ($releaseEntries.Count -ne $expectedFileCount) {
    throw "Installed release file count mismatch. Expected $expectedFileCount but got $($releaseEntries.Count)."
}
if ($installedFileListHash -ne $expectedFileListHash.ToLowerInvariant()) {
    throw "Installed release file list sha256 mismatch. Expected $expectedFileListHash but got $installedFileListHash."
}

Assert-PathExists -Path (Join-Path $releaseDirPath "swimcrm\manage.py") -Label "Django manage.py"
Assert-PathExists -Path (Join-Path $releaseDirPath "swimcrm\requirements.txt") -Label "Backend requirements.txt"
Assert-PathExists -Path (Join-Path $releaseDirPath "frontend\package.json") -Label "Frontend package.json"
Assert-PathExists -Path (Join-Path $releaseDirPath "frontend\package-lock.json") -Label "Frontend package-lock.json"
if ($isDeploymentBundle) {
    Assert-PathExists -Path (Join-Path $releaseDirPath "frontend\dist\index.html") -Label "Bundled frontend index.html"
    Assert-PathExists -Path (Join-Path $releaseDirPath "RELEASE_PROVENANCE.json") -Label "Release provenance"
}

if ($RequireInstalledDependencies) {
    $backendPython = Join-Path $releaseDirPath "swimcrm\.venv\Scripts\python.exe"
    Assert-PathExists -Path $backendPython -Label "Backend virtualenv Python"
    & $backendPython -c "import waitress"
    if ($LASTEXITCODE -ne 0) {
        throw "Backend virtualenv must include the Waitress production WSGI server."
    }
    Assert-PathExists -Path (Join-Path $releaseDirPath "frontend\node_modules") -Label "Frontend node_modules"
    Write-Host "Backend dependencies installed."
    Write-Host "Waitress production WSGI server installed."
    Write-Host "Frontend dependencies installed."
}

Write-Host "Target-host release install verified."
Write-Host "release_dir: $releaseDirPath"
Write-Host "commit_sha: $($manifestData.commit_sha)"
Write-Host "archive_sha256: $($manifestData.archive_sha256)"
Write-Host "tracked_file_count: $($releaseEntries.Count)"
Write-Host "tracked_file_list_sha256: $installedFileListHash"
