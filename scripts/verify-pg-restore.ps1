param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$TempDb = "swimcrm_restore_check",
    [string]$User = $env:POSTGRES_USER,
    [string]$Password = $env:POSTGRES_PASSWORD,
    [string]$HostName = $env:POSTGRES_HOST,
    [string]$Port = $env:POSTGRES_PORT,
    [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }),
    [string]$ExpectedSha256 = "",
    [switch]$KeepTempDb
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib-production-guards.ps1")

if (-not $User) { $User = "postgres" }
if (-not $HostName) { $HostName = "127.0.0.1" }
if (-not $Port) { $Port = "5432" }
if ($Password) { $env:PGPASSWORD = $Password }

Assert-ProductionValue -Name "POSTGRES_USER" -Value $User
Assert-ProductionPassword -Name "POSTGRES_PASSWORD" -Value $Password

$dropdb = Join-Path $PgBin "dropdb.exe"
$createdb = Join-Path $PgBin "createdb.exe"
$pgRestore = Join-Path $PgBin "pg_restore.exe"
$psql = Join-Path $PgBin "psql.exe"

foreach ($tool in @($dropdb, $createdb, $pgRestore, $psql)) {
    if (-not (Test-Path -LiteralPath $tool)) {
        throw "PostgreSQL tool not found: $tool"
    }
}

if (-not (Test-Path -LiteralPath $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}

if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $sidecar = "$BackupFile.sha256"
    if (-not (Test-Path -LiteralPath $sidecar)) {
        throw "Backup checksum file not found: $sidecar"
    }
    $ExpectedSha256 = ((Get-Content -LiteralPath $sidecar -Raw).Trim() -split '\s+')[0]
}
if ($ExpectedSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    throw "ExpectedSha256 must be a SHA-256 digest"
}
$actualSha256 = (Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash
if (-not $actualSha256.Equals($ExpectedSha256, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Backup SHA-256 mismatch; restore was not attempted"
}
Write-Host "Backup dump SHA-256 verified: $actualSha256"

& $pgRestore -l $BackupFile | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "pg_restore catalog verification failed with exit code $LASTEXITCODE"
}
Write-Host "Backup dump catalog verification passed."

& $dropdb -w -h $HostName -p $Port -U $User --if-exists $TempDb
& $createdb -w -h $HostName -p $Port -U $User $TempDb
if ($LASTEXITCODE -ne 0) {
    throw "createdb failed with exit code $LASTEXITCODE"
}

& $pgRestore -w -h $HostName -p $Port -U $User -d $TempDb --clean --if-exists $BackupFile
if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed with exit code $LASTEXITCODE"
}

& $psql -w -h $HostName -p $Port -U $User -d $TempDb -c "select count(*) as django_migrations from django_migrations;"
if ($LASTEXITCODE -ne 0) {
    throw "restore verification query failed with exit code $LASTEXITCODE"
}

& $psql -w -h $HostName -p $Port -U $User -d $TempDb -c "select conname, contype from pg_constraint where conname = 'excl_trainer_time_overlap';"
if ($LASTEXITCODE -ne 0) {
    throw "restore constraint verification failed with exit code $LASTEXITCODE"
}

Write-Host "Restore verification OK in temp database: $TempDb"
if (-not $KeepTempDb) {
    & $dropdb -w -h $HostName -p $Port -U $User --if-exists $TempDb
    if ($LASTEXITCODE -ne 0) {
        throw "cleanup dropdb failed with exit code $LASTEXITCODE"
    }
    Write-Host "Temp database dropped: $TempDb"
} else {
    Write-Host "Temp database kept: $TempDb"
}
