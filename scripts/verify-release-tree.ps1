[CmdletBinding()]
param(
    [switch]$Strict,
    [switch]$SourceOnly,
    [switch]$RequireTrackedReleaseFiles
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$blocked = New-Object System.Collections.Generic.List[string]
$canUseGitFileList = $false

$requiredReleaseFiles = @(
    "package.json",
    "package-lock.json",
    "frontend\package.json",
    "frontend\package-lock.json"
)

if ($Strict -and $SourceOnly) {
    throw "Use either -Strict for clean checkout validation or -SourceOnly for release-source packaging validation, not both."
}

try {
    & git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
    $canUseGitFileList = ($LASTEXITCODE -eq 0)
}
catch {
    $canUseGitFileList = $false
}

if ($RequireTrackedReleaseFiles -and -not $canUseGitFileList) {
    throw "-RequireTrackedReleaseFiles requires a git work tree."
}

function Add-BlockedPath {
    param(
        [string]$Path,
        [string]$Reason
    )
    $rootWithSlash = $RepoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $rootUri = [System.Uri]::new($rootWithSlash)
    $pathUri = [System.Uri]::new($Path)
    $relative = [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $blocked.Add("$relative ($Reason)")
}

$blockedDirs = @(
    ".runtime",
    ".nocobase",
    ".nocobase-logs",
    ".npm-cache",
    ".yarn-cache",
    "receipts",
    "swimcrm\receipts",
    "swimcrm-hybrid",
    "backups",
    "releases",
    "frontend\dist",
    "dist"
)

if ($Strict) {
    $blockedDirs += @(
        ".venv",
        "swimcrm\.venv",
        "node_modules",
        "frontend\node_modules",
        "swimcrm-hybrid\source\node_modules"
    )
}

foreach ($relative in $blockedDirs) {
    $path = Join-Path $RepoRoot $relative
    if (Test-Path -LiteralPath $path) {
        if (($SourceOnly -or -not $Strict) -and $canUseGitFileList) {
            & git -C $RepoRoot check-ignore -q -- $relative
            if ($LASTEXITCODE -eq 0) {
                continue
            }
        }
        Add-BlockedPath $path "generated/runtime directory"
    }
}

foreach ($relative in $requiredReleaseFiles) {
    $path = Join-Path $RepoRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-BlockedPath $path "missing required release manifest"
        continue
    }
    if ($RequireTrackedReleaseFiles) {
        $trackedPath = & git -C $RepoRoot -c core.quotepath=false ls-files -- $relative
        if (-not $trackedPath) {
            Add-BlockedPath $path "required release manifest is not tracked by git"
        }
    }
}

if ($Strict -and $blocked.Count -gt 0) {
    $message = "Release tree contains blocked artifacts:`n- " + ($blocked -join "`n- ")
    throw $message
}

$excludedPrefixes = @(
    (Join-Path $RepoRoot ".git"),
    (Join-Path $RepoRoot ".codebase-memory")
)

$blockedNames = @(
    ".env",
    "PRODUCTION_CUTOVER_EVIDENCE.json",
    "PRODUCTION_CUTOVER_EVIDENCE.draft.json",
    "RELEASE_BACKLOG_TEMP.md",
    "swimcrm.zip",
    "db.sqlite3"
)

$blockedExtensions = @(
    ".sqlite3",
    ".sqlite3-journal",
    ".dump",
    ".zip"
)

$filesToScan = @()
if ($SourceOnly) {
    if (-not $canUseGitFileList) {
        throw "-SourceOnly requires a git work tree so the release-source file list can be verified."
    }
    $filesToScan = & git -C $RepoRoot -c core.quotepath=false ls-files --cached --others --exclude-standard
}
elseif (-not $Strict -and $canUseGitFileList) {
    $filesToScan = & git -C $RepoRoot -c core.quotepath=false ls-files --cached --others --exclude-standard
}
else {
    $filesToScan = Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
        ForEach-Object { $_.FullName }
}

$filesToScan | ForEach-Object {
    $fullName = $_
    if (-not [System.IO.Path]::IsPathRooted($fullName)) {
        $fullName = Join-Path $RepoRoot $fullName
    }

    foreach ($prefix in $excludedPrefixes) {
        if ($fullName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return
        }
    }

    $fileName = Split-Path -Leaf $fullName

    if ($blockedNames -contains $fileName) {
        Add-BlockedPath $fullName "blocked release artifact name"
        return
    }

    foreach ($extension in $blockedExtensions) {
        if ($fileName.EndsWith($extension, [System.StringComparison]::OrdinalIgnoreCase)) {
            Add-BlockedPath $fullName "blocked release artifact extension"
            return
        }
    }
}

if ($blocked.Count -gt 0) {
    $message = "Release tree contains blocked artifacts:`n- " + ($blocked -join "`n- ")
    throw $message
}

Write-Host "Release tree artifact scan passed."
