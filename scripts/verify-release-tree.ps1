[CmdletBinding()]
param(
    [switch]$Strict
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$blocked = New-Object System.Collections.Generic.List[string]

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
    "receipts",
    "swimcrm\receipts",
    "backups",
    "frontend\dist",
    "dist"
)

if ($Strict) {
    $blockedDirs += @(
        ".venv",
        "swimcrm\.venv",
        "node_modules",
        "frontend\node_modules"
    )
}

foreach ($relative in $blockedDirs) {
    $path = Join-Path $RepoRoot $relative
    if (Test-Path -LiteralPath $path) {
        Add-BlockedPath $path "generated/runtime directory"
    }
}

$excludedPrefixes = @(
    (Join-Path $RepoRoot ".git"),
    (Join-Path $RepoRoot ".codebase-memory")
)

$blockedNames = @(
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

Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $fullName = $_.FullName
    foreach ($prefix in $excludedPrefixes) {
        if ($fullName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return
        }
    }

    if ($blockedNames -contains $_.Name) {
        Add-BlockedPath $fullName "blocked release artifact name"
        return
    }

    foreach ($extension in $blockedExtensions) {
        if ($_.Name.EndsWith($extension, [System.StringComparison]::OrdinalIgnoreCase)) {
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
