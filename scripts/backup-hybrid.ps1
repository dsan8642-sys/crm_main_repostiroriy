[CmdletBinding()]
param(
    [string]$OutDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\backups" }),
    [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }),
    [string]$HostName = $(if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "127.0.0.1" }),
    [string]$Port = $(if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }),
    [string]$DjangoDbName = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "swimcrm" }),
    [string]$DjangoUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }),
    [string]$DjangoPassword = $env:POSTGRES_PASSWORD,
    [string]$NocoBaseDbName = $(if ($env:NOCOBASE_DB_DATABASE) { $env:NOCOBASE_DB_DATABASE } else { "nocobase_hybrid" }),
    [string]$NocoBaseUser = $(if ($env:NOCOBASE_DB_USER) { $env:NOCOBASE_DB_USER } else { $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }) }),
    [string]$NocoBasePassword = $(if ($env:NOCOBASE_DB_PASSWORD) { $env:NOCOBASE_DB_PASSWORD } else { $env:POSTGRES_PASSWORD }),
    [string]$MediaRoot = $(if ($env:MEDIA_ROOT) { $env:MEDIA_ROOT } else { "" }),
    [string]$NocoBaseStorageDir = $(if ($env:NOCOBASE_STORAGE_DIR) { $env:NOCOBASE_STORAGE_DIR } else { ".\swimcrm-hybrid\source\storage" }),
    [switch]$SkipDjangoDb,
    [switch]$SkipNocoBaseDb,
    [switch]$SkipMedia,
    [switch]$SkipNocoBaseStorage,
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib-production-guards.ps1")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupSetDir = Join-Path $OutDir "hybrid-$stamp"
$pgDump = Join-Path $PgBin "pg_dump.exe"

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Assert-Tool {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required PostgreSQL tool not found: $Path"
    }
}

function Invoke-PgDump {
    param(
        [string]$DbName,
        [string]$User,
        [string]$Password,
        [string]$OutputFile
    )
    if ($Password) {
        $env:PGPASSWORD = $Password
    }
    else {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
    & $pgDump -w -h $HostName -p $Port -U $User -d $DbName -Fc -f $OutputFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed for database '$DbName' with exit code $LASTEXITCODE"
    }
}

function Add-ZipIfPresent {
    param(
        [string]$SourcePath,
        [string]$ArchivePath,
        [string]$Label
    )
    if ([string]::IsNullOrWhiteSpace($SourcePath)) {
        Write-Host "Skipping $Label archive: no path configured."
        return $false
    }
    $resolved = Resolve-Path -LiteralPath $SourcePath -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-Host "Skipping $Label archive: path not found: $SourcePath"
        return $false
    }
    Compress-Archive -LiteralPath $resolved.Path -DestinationPath $ArchivePath -Force
    return $true
}

function Get-FileSha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

Assert-ProductionPathOutsideRepo -Name "BACKUP_DIR" -Value $OutDir -RepoRoot $RepoRoot
if (-not $SkipDjangoDb) {
    Assert-ProductionValue -Name "POSTGRES_DB" -Value $DjangoDbName
    Assert-ProductionValue -Name "POSTGRES_USER" -Value $DjangoUser
    Assert-ProductionPassword -Name "POSTGRES_PASSWORD" -Value $DjangoPassword
}
if (-not $SkipNocoBaseDb) {
    Assert-ProductionValue -Name "NOCOBASE_DB_DATABASE" -Value $NocoBaseDbName
    Assert-ProductionValue -Name "NOCOBASE_DB_USER" -Value $NocoBaseUser
    Assert-ProductionPassword -Name "NOCOBASE_DB_PASSWORD" -Value $NocoBasePassword
}
if (-not $SkipMedia) {
    Assert-ProductionPathOutsideRepo -Name "MEDIA_ROOT" -Value $MediaRoot -RepoRoot $RepoRoot
}
if (-not $SkipNocoBaseStorage) {
    Assert-ProductionPathOutsideRepo -Name "NOCOBASE_STORAGE_DIR" -Value $NocoBaseStorageDir -RepoRoot $RepoRoot
}

$plan = [ordered]@{
    created_at = (Get-Date).ToString("o")
    backup_set_dir = $backupSetDir
    postgres_host = $HostName
    postgres_port = $Port
    django_database = if ($SkipDjangoDb) { $null } else { $DjangoDbName }
    nocobase_database = if ($SkipNocoBaseDb) { $null } else { $NocoBaseDbName }
    media_root = if ($SkipMedia) { $null } else { $MediaRoot }
    nocobase_storage_dir = if ($SkipNocoBaseStorage) { $null } else { $NocoBaseStorageDir }
}

if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 5
    exit 0
}

New-Item -ItemType Directory -Force -Path $backupSetDir | Out-Null

if (-not $SkipDjangoDb -or -not $SkipNocoBaseDb) {
    Assert-Tool $pgDump
}

if (-not $SkipDjangoDb) {
    Write-Step "Backing up Django database '$DjangoDbName'"
    $djangoDumpPath = Join-Path $backupSetDir "django-$DjangoDbName.dump"
    Invoke-PgDump -DbName $DjangoDbName -User $DjangoUser -Password $DjangoPassword `
        -OutputFile $djangoDumpPath
    $plan["django_dump_sha256"] = Get-FileSha256 -Path $djangoDumpPath
}

if (-not $SkipNocoBaseDb) {
    Write-Step "Backing up NocoBase database '$NocoBaseDbName'"
    $nocobaseDumpPath = Join-Path $backupSetDir "nocobase-$NocoBaseDbName.dump"
    Invoke-PgDump -DbName $NocoBaseDbName -User $NocoBaseUser -Password $NocoBasePassword `
        -OutputFile $nocobaseDumpPath
    $plan["nocobase_dump_sha256"] = Get-FileSha256 -Path $nocobaseDumpPath
}

if (-not $SkipMedia) {
    Write-Step "Archiving Django media"
    $mediaArchivePath = Join-Path $backupSetDir "django-media.zip"
    $plan.media_archive_created = Add-ZipIfPresent -SourcePath $MediaRoot `
        -ArchivePath $mediaArchivePath -Label "Django media"
    if ($plan.media_archive_created) {
        $plan["media_archive_sha256"] = Get-FileSha256 -Path $mediaArchivePath
    }
}

if (-not $SkipNocoBaseStorage) {
    Write-Step "Archiving NocoBase storage"
    $nocobaseStorageArchivePath = Join-Path $backupSetDir "nocobase-storage.zip"
    $plan.nocobase_storage_archive_created = Add-ZipIfPresent -SourcePath $NocoBaseStorageDir `
        -ArchivePath $nocobaseStorageArchivePath -Label "NocoBase storage"
    if ($plan.nocobase_storage_archive_created) {
        $plan["nocobase_storage_archive_sha256"] = Get-FileSha256 -Path $nocobaseStorageArchivePath
    }
}

$plan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupSetDir "manifest.json") -Encoding UTF8
Write-Host "Hybrid backup set written: $backupSetDir"
