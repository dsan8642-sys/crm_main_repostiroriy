[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupSetDir,
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
    [switch]$ConfirmRestore,
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib-production-guards.ps1")
$pgRestore = Join-Path $PgBin "pg_restore.exe"
$psql = Join-Path $PgBin "psql.exe"

function Assert-Tool {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required PostgreSQL tool not found: $Path"
    }
}

function Invoke-RestoreDb {
    param(
        [string]$DumpFile,
        [string]$DbName,
        [string]$User,
        [string]$Password
    )
    if (-not (Test-Path -LiteralPath $DumpFile)) {
        throw "Database dump not found: $DumpFile"
    }
    if ($Password) {
        $env:PGPASSWORD = $Password
    }
    else {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
    & $pgRestore -w -h $HostName -p $Port -U $User -d $DbName --clean --if-exists $DumpFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed for database '$DbName' with exit code $LASTEXITCODE"
    }
}

function Restore-ZipIfPresent {
    param(
        [string]$ArchivePath,
        [string]$DestinationPath,
        [string]$Label
    )
    if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
        Write-Host "Skipping $Label restore: no destination configured."
        return
    }
    if (-not (Test-Path -LiteralPath $ArchivePath)) {
        Write-Host "Skipping $Label restore: archive not found: $ArchivePath"
        return
    }
    New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force
}

$resolvedBackup = Resolve-Path -LiteralPath $BackupSetDir -ErrorAction Stop
$manifestPath = Join-Path $resolvedBackup.Path "manifest.json"
$djangoDump = Get-ChildItem -LiteralPath $resolvedBackup.Path -Filter "django-*.dump" -File -ErrorAction SilentlyContinue | Select-Object -First 1
$nocobaseDump = Get-ChildItem -LiteralPath $resolvedBackup.Path -Filter "nocobase-*.dump" -File -ErrorAction SilentlyContinue | Select-Object -First 1

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
    backup_set_dir = $resolvedBackup.Path
    manifest = if (Test-Path -LiteralPath $manifestPath) { $manifestPath } else { $null }
    django_dump = if ($djangoDump) { $djangoDump.FullName } else { $null }
    nocobase_dump = if ($nocobaseDump) { $nocobaseDump.FullName } else { $null }
    django_database = if ($SkipDjangoDb) { $null } else { $DjangoDbName }
    nocobase_database = if ($SkipNocoBaseDb) { $null } else { $NocoBaseDbName }
    media_root = if ($SkipMedia) { $null } else { $MediaRoot }
    nocobase_storage_dir = if ($SkipNocoBaseStorage) { $null } else { $NocoBaseStorageDir }
}

if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 5
    exit 0
}

if (-not $ConfirmRestore) {
    throw "Restore is destructive. Re-run with -ConfirmRestore after stopping Django, workers, schedulers, and NocoBase."
}

if (-not $SkipDjangoDb -or -not $SkipNocoBaseDb) {
    Assert-Tool $pgRestore
    Assert-Tool $psql
}

if (-not $SkipDjangoDb) {
    Invoke-RestoreDb -DumpFile $djangoDump.FullName -DbName $DjangoDbName -User $DjangoUser -Password $DjangoPassword
    & $psql -w -h $HostName -p $Port -U $DjangoUser -d $DjangoDbName -c "select count(*) as django_migrations from django_migrations;"
}

if (-not $SkipNocoBaseDb) {
    Invoke-RestoreDb -DumpFile $nocobaseDump.FullName -DbName $NocoBaseDbName -User $NocoBaseUser -Password $NocoBasePassword
}

if (-not $SkipMedia) {
    Restore-ZipIfPresent -ArchivePath (Join-Path $resolvedBackup.Path "django-media.zip") `
        -DestinationPath $MediaRoot -Label "Django media"
}

if (-not $SkipNocoBaseStorage) {
    Restore-ZipIfPresent -ArchivePath (Join-Path $resolvedBackup.Path "nocobase-storage.zip") `
        -DestinationPath $NocoBaseStorageDir -Label "NocoBase storage"
}

Write-Host "Hybrid restore completed from: $($resolvedBackup.Path)"
