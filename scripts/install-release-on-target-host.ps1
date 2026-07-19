[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Manifest,
    [string]$InstallRoot = $(if ($env:SWIMCRM_RELEASE_ROOT) { $env:SWIMCRM_RELEASE_ROOT } else { "" }),
    [string]$ReleaseDir = "",
    [string]$Python = $(if ($env:PYTHON) { $env:PYTHON } else { "python.exe" }),
    [string]$NocoBaseAppRoot = $(if ($env:NOCOBASE_APP_ROOT) { $env:NOCOBASE_APP_ROOT } else { "" }),
    [string]$NocoBaseStorageDir = $(if ($env:NOCOBASE_STORAGE_DIR) { $env:NOCOBASE_STORAGE_DIR } else { "" }),
    [switch]$RunInstall
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ArchiveVerifier = Join-Path $RepoRoot "scripts\verify-release-source-archive.ps1"

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

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
}

if (-not (Test-Path -LiteralPath $ArchiveVerifier)) {
    throw "Release archive verifier not found at $ArchiveVerifier."
}

$manifestPath = Resolve-RequiredPath -Path $Manifest -Label "Manifest"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Release source archive manifest does not exist: $manifestPath"
}

$manifestDir = Split-Path -Parent $manifestPath
$manifestData = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$archivePath = Resolve-ArchivePath -ManifestData $manifestData -ManifestDir $manifestDir

if ([string]::IsNullOrWhiteSpace($InstallRoot) -and [string]::IsNullOrWhiteSpace($ReleaseDir)) {
    throw "InstallRoot or ReleaseDir is required. Set SWIMCRM_RELEASE_ROOT or pass -InstallRoot/-ReleaseDir."
}
if ([string]::IsNullOrWhiteSpace($ReleaseDir)) {
    $installRootPath = Resolve-RequiredPath -Path $InstallRoot -Label "InstallRoot"
    $ReleaseDir = Join-Path $installRootPath ("swimcrm-release-{0}" -f $manifestData.short_sha)
}
else {
    $ReleaseDir = Resolve-RequiredPath -Path $ReleaseDir -Label "ReleaseDir"
}

$nocoBaseAppRootPath = Resolve-RequiredPath -Path $NocoBaseAppRoot -Label "NocoBaseAppRoot"
$nocoBaseStorageDirPath = Resolve-RequiredPath -Path $NocoBaseStorageDir -Label "NocoBaseStorageDir"

if (Test-PathInside -Child $nocoBaseAppRootPath -Parent $ReleaseDir) {
    throw "NOCOBASE_APP_ROOT must be outside the extracted release source tree."
}
if (Test-PathInside -Child $nocoBaseStorageDirPath -Parent $ReleaseDir) {
    throw "NOCOBASE_STORAGE_DIR must be outside the extracted release source tree."
}

$backendDir = Join-Path $ReleaseDir "swimcrm"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$frontendDir = Join-Path $ReleaseDir "frontend"
$plan = [ordered]@{
    manifest = $manifestPath
    archive = $archivePath
    commit_sha = $manifestData.commit_sha
    short_sha = $manifestData.short_sha
    archive_sha256 = $manifestData.archive_sha256
    tracked_file_count = $manifestData.tracked_file_count
    tracked_file_list_sha256 = $manifestData.tracked_file_list_sha256
    release_dir = $ReleaseDir
    backend_dir = $backendDir
    backend_python = $backendPython
    frontend_dir = $frontendDir
    nocobase_app_root = $nocoBaseAppRootPath
    nocobase_storage_dir = $nocoBaseStorageDirPath
    run_install = [bool]$RunInstall
    steps = @(
        "verify release source archive manifest and contents",
        "extract archive into an empty release directory",
        "create backend virtualenv and install swimcrm/requirements.txt",
        "install root Node tooling with npm ci",
        "install frontend dependencies with npm ci",
        "run Django migrate --check",
        "prepare NocoBase app/storage roots outside the source tree"
    )
}

if (-not $RunInstall) {
    $plan | ConvertTo-Json -Depth 4
    Write-Host "Plan only. Re-run with -RunInstall to install the release on the target host."
    return
}

Invoke-Step "Verify release source archive" {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ArchiveVerifier $manifestPath
    if ($LASTEXITCODE -ne 0) {
        throw "Release source archive verification failed with exit code $LASTEXITCODE."
    }
}

if (Test-Path -LiteralPath $ReleaseDir) {
    $existingItems = @(Get-ChildItem -LiteralPath $ReleaseDir -Force)
    if ($existingItems.Count -gt 0) {
        throw "ReleaseDir must be empty before extraction: $ReleaseDir"
    }
}
else {
    New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
}

Invoke-Step "Extract release archive" {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $ReleaseDir
    Write-Host "Release archive extracted on target host."
}

Invoke-Step "Install backend dependencies" {
    & $Python -m venv (Join-Path $backendDir ".venv")
    if ($LASTEXITCODE -ne 0) {
        throw "Backend virtualenv creation failed with exit code $LASTEXITCODE."
    }
    & $backendPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Backend pip upgrade failed with exit code $LASTEXITCODE."
    }
    & $backendPython -m pip install -r (Join-Path $backendDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "Backend dependency installation failed with exit code $LASTEXITCODE."
    }
    Write-Host "Backend dependencies installed."
}

Invoke-Step "Install root Node tooling" {
    Push-Location $ReleaseDir
    try {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) {
            throw "Root Node tooling installation failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "Root Node tooling installed."
}

Invoke-Step "Install frontend dependencies" {
    Push-Location $frontendDir
    try {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend dependency installation failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "Frontend dependencies installed."
}

Invoke-Step "Check Django migrations" {
    Push-Location $backendDir
    try {
        & $backendPython "manage.py" "migrate" "--check"
        if ($LASTEXITCODE -ne 0) {
            throw "Django migrations check failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "Django migrations check passed."
}

Invoke-Step "Prepare NocoBase runtime roots" {
    New-Item -ItemType Directory -Force -Path $nocoBaseAppRootPath | Out-Null
    New-Item -ItemType Directory -Force -Path $nocoBaseStorageDirPath | Out-Null
    Write-Host "NocoBase app root outside source tree."
    Write-Host "NocoBase storage outside source tree."
}

Write-Host ""
Write-Host "Target-host release install completed."
Write-Host "commit_sha: $($manifestData.commit_sha)"
Write-Host "archive_sha256: $($manifestData.archive_sha256)"
Write-Host "tracked_file_count: $($manifestData.tracked_file_count)"
Write-Host "tracked_file_list_sha256: $($manifestData.tracked_file_list_sha256)"
