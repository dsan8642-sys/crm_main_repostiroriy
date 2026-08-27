param(
    [string]$OutDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\backups" }),
    [string]$DbName = $env:POSTGRES_DB,
    [string]$User = $env:POSTGRES_USER,
    [string]$Password = $env:POSTGRES_PASSWORD,
    [string]$HostName = $env:POSTGRES_HOST,
    [string]$Port = $env:POSTGRES_PORT,
    [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }),
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib-production-guards.ps1")

if (-not $DbName) { $DbName = "swimcrm" }
if (-not $User) { $User = "postgres" }
if (-not $HostName) { $HostName = "127.0.0.1" }
if (-not $Port) { $Port = "5432" }
if ($Password) { $env:PGPASSWORD = $Password }

Assert-ProductionPathOutsideRepo -Name "BACKUP_DIR" -Value $OutDir -RepoRoot $RepoRoot
Assert-ProductionValue -Name "POSTGRES_DB" -Value $DbName
Assert-ProductionValue -Name "POSTGRES_USER" -Value $User
Assert-ProductionPassword -Name "POSTGRES_PASSWORD" -Value $Password

$pgDump = Join-Path $PgBin "pg_dump.exe"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "$DbName-$stamp.dump"
$plan = [ordered]@{
    backup_file = $file
    postgres_host = $HostName
    postgres_port = $Port
    database = $DbName
    user = $User
    password_configured = -not [string]::IsNullOrWhiteSpace($Password)
}
if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 4
    exit 0
}

if (-not (Test-Path -LiteralPath $pgDump)) {
    throw "pg_dump.exe not found at $pgDump"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& $pgDump -w -h $HostName -p $Port -U $User -d $DbName -Fc -f $file
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE"
}

$sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
$hashFile = "$file.sha256"
Set-Content -LiteralPath $hashFile -Value "$sha256  $(Split-Path -Leaf $file)" -NoNewline -Encoding ascii
Write-Host "PostgreSQL backup written: $file"
Write-Host "Backup dump SHA-256: $sha256"
Write-Host "Backup checksum file: $hashFile"
