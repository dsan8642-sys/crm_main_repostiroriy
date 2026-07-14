param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$TempDb = "swimcrm_restore_check",
    [string]$User = $env:POSTGRES_USER,
    [string]$Password = $env:POSTGRES_PASSWORD,
    [string]$HostName = $env:POSTGRES_HOST,
    [string]$Port = $env:POSTGRES_PORT,
    [switch]$KeepTempDb
)

if (-not $User) { $User = "postgres" }
if (-not $HostName) { $HostName = "127.0.0.1" }
if (-not $Port) { $Port = "5432" }
if ($Password) { $env:PGPASSWORD = $Password }

$bin = "C:\Program Files\PostgreSQL\17\bin"
$dropdb = Join-Path $bin "dropdb.exe"
$createdb = Join-Path $bin "createdb.exe"
$pgRestore = Join-Path $bin "pg_restore.exe"
$psql = Join-Path $bin "psql.exe"

foreach ($tool in @($dropdb, $createdb, $pgRestore, $psql)) {
    if (-not (Test-Path -LiteralPath $tool)) {
        throw "PostgreSQL tool not found: $tool"
    }
}

if (-not (Test-Path -LiteralPath $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}

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
