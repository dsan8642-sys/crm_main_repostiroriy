param(
    [string]$OutDir = ".\backups",
    [string]$DbName = $env:POSTGRES_DB,
    [string]$User = $env:POSTGRES_USER,
    [string]$Password = $env:POSTGRES_PASSWORD,
    [string]$HostName = $env:POSTGRES_HOST,
    [string]$Port = $env:POSTGRES_PORT
)

if (-not $DbName) { $DbName = "swimcrm" }
if (-not $User) { $User = "postgres" }
if (-not $HostName) { $HostName = "127.0.0.1" }
if (-not $Port) { $Port = "5432" }
if ($Password) { $env:PGPASSWORD = $Password }

$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
if (-not (Test-Path -LiteralPath $pgDump)) {
    throw "pg_dump.exe not found at $pgDump"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "$DbName-$stamp.dump"

& $pgDump -w -h $HostName -p $Port -U $User -d $DbName -Fc -f $file
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE"
}

Write-Host "Backup written: $file"
