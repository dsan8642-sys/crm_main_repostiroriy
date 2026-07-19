[CmdletBinding()]
param(
    [string]$BackupSetDir = "",
    [string]$OutDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\backups" }),
    [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }),
    [switch]$SkipDjangoRestore,
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib-production-guards.ps1")

function Resolve-BackupSet {
    if (-not [string]::IsNullOrWhiteSpace($BackupSetDir)) {
        return (Resolve-Path -LiteralPath $BackupSetDir -ErrorAction Stop).Path
    }

    Assert-ProductionPathOutsideRepo -Name "BACKUP_DIR" -Value $OutDir -RepoRoot $RepoRoot
    $resolvedOut = Resolve-Path -LiteralPath $OutDir -ErrorAction Stop
    $latest = Get-ChildItem -LiteralPath $resolvedOut.Path -Directory -Filter "hybrid-*" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw "No hybrid backup set found in BACKUP_DIR: $($resolvedOut.Path)"
    }
    return $latest.FullName
}

function Assert-Tool {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required PostgreSQL tool not found: $Path"
    }
}

function Assert-File {
    param([string]$Path, [string]$Label)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Label not found: $Path"
    }
}

function Assert-PgDumpReadable {
    param([string]$DumpFile, [string]$Label)
    & $pgRestore --list $DumpFile | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "$Label dump is not readable by pg_restore --list: $DumpFile"
    }
    if ($Label -eq "Django") {
        Write-Host "Django dump list OK: $DumpFile"
        return
    }
    if ($Label -eq "NocoBase") {
        Write-Host "NocoBase dump list OK: $DumpFile"
        return
    }
    Write-Host "$Label dump list OK: $DumpFile"
}

function Assert-FileSha256 {
    param(
        [string]$Path,
        [string]$ExpectedHash,
        [string]$Label
    )
    if (-not ($ExpectedHash -match "^[0-9a-f]{64}$")) {
        throw "$Label sha256 is missing or invalid in hybrid backup manifest."
    }
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash.ToLowerInvariant()) {
        throw "$Label sha256 mismatch. Expected $ExpectedHash but got $actualHash."
    }
    Write-Host "$Label sha256 OK: $actualHash"
}

$pgRestore = Join-Path $PgBin "pg_restore.exe"
$backupPath = Resolve-BackupSet
$manifestPath = Join-Path $backupPath "manifest.json"
Assert-File -Path $manifestPath -Label "Hybrid backup manifest"

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$djangoDump = Get-ChildItem -LiteralPath $backupPath -Filter "django-*.dump" -File -ErrorAction SilentlyContinue | Select-Object -First 1
$nocobaseDump = Get-ChildItem -LiteralPath $backupPath -Filter "nocobase-*.dump" -File -ErrorAction SilentlyContinue | Select-Object -First 1

Assert-File -Path $djangoDump.FullName -Label "Django database dump"
Assert-File -Path $nocobaseDump.FullName -Label "NocoBase database dump"
if (-not $manifest.django_database) {
    throw "Hybrid backup manifest must include django_database."
}
if (-not $manifest.nocobase_database) {
    throw "Hybrid backup manifest must include nocobase_database."
}
Assert-FileSha256 -Path $djangoDump.FullName -ExpectedHash $manifest.django_dump_sha256 -Label "Django dump"
Assert-FileSha256 -Path $nocobaseDump.FullName -ExpectedHash $manifest.nocobase_dump_sha256 -Label "NocoBase dump"
if ($manifest.media_archive_created -eq $true) {
    $mediaArchive = Join-Path $backupPath "django-media.zip"
    Assert-File -Path $mediaArchive -Label "Django media archive"
    Assert-FileSha256 -Path $mediaArchive -ExpectedHash $manifest.media_archive_sha256 -Label "Django media archive"
}
if ($manifest.nocobase_storage_archive_created -eq $true) {
    $storageArchive = Join-Path $backupPath "nocobase-storage.zip"
    Assert-File -Path $storageArchive -Label "NocoBase storage archive"
    Assert-FileSha256 -Path $storageArchive -ExpectedHash $manifest.nocobase_storage_archive_sha256 -Label "NocoBase storage archive"
}

$plan = [ordered]@{
    backup_set_dir = $backupPath
    manifest = $manifestPath
    django_database = $manifest.django_database
    nocobase_database = $manifest.nocobase_database
    django_dump = $djangoDump.FullName
    nocobase_dump = $nocobaseDump.FullName
    django_restore_drill = -not $SkipDjangoRestore
}

if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 5
    exit 0
}

Assert-Tool $pgRestore
Assert-PgDumpReadable -DumpFile $djangoDump.FullName -Label "Django"
Assert-PgDumpReadable -DumpFile $nocobaseDump.FullName -Label "NocoBase"

if (-not $SkipDjangoRestore) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-pg-restore.ps1") `
        -BackupFile $djangoDump.FullName `
        -PgBin $PgBin
    if ($LASTEXITCODE -ne 0) {
        throw "Django restore drill failed for hybrid backup set with exit code $LASTEXITCODE"
    }
}

Write-Host "Hybrid backup set verification OK: $backupPath"
