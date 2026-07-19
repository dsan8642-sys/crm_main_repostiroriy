[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackupHybrid = Join-Path $RepoRoot "scripts\backup-hybrid.ps1"
$RestoreHybrid = Join-Path $RepoRoot "scripts\restore-hybrid.ps1"
$VerifyHybridBackupSet = Join-Path $RepoRoot "scripts\verify-hybrid-backup-set.ps1"
$BackupPg = Join-Path $RepoRoot "scripts\backup-pg.ps1"
$TempBackupSet = Join-Path $env:TEMP ("swimcrm-guard-empty-backup-{0}" -f ([guid]::NewGuid().ToString("N")))
$TempCorruptBackupSet = Join-Path $env:TEMP ("swimcrm-guard-corrupt-backup-{0}" -f ([guid]::NewGuid().ToString("N")))
$EnvNames = @(
    "DJANGO_ENV",
    "BACKUP_DIR",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "MEDIA_ROOT",
    "NOCOBASE_DB_DATABASE",
    "NOCOBASE_DB_USER",
    "NOCOBASE_DB_PASSWORD",
    "NOCOBASE_STORAGE_DIR"
)

function Invoke-WithCleanEnv {
    param(
        [scriptblock]$Command,
        [hashtable]$Env = @{}
    )
    $saved = @{}
    foreach ($name in $EnvNames) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
        [Environment]::SetEnvironmentVariable($name, $null, "Process")
    }
    try {
        foreach ($key in $Env.Keys) {
            [Environment]::SetEnvironmentVariable($key, $Env[$key], "Process")
        }
        $previous = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $output = & $Command 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previous
        }
        return @{ exit_code = $exitCode; output = ($output -join "`n") }
    }
    finally {
        foreach ($name in $EnvNames) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process")
        }
    }
}

function Assert-FailsWith {
    param(
        [hashtable]$Result,
        [string]$Pattern,
        [string]$Label
    )
    if ($Result.exit_code -eq 0 -or $Result.output -notmatch $Pattern) {
        throw "$Label did not fail with expected pattern '$Pattern'. Output: $($Result.output)"
    }
}

if (Test-Path -LiteralPath $TempBackupSet) {
    Remove-Item -LiteralPath $TempBackupSet -Recurse -Force
}
New-Item -ItemType Directory -Path $TempBackupSet | Out-Null
Set-Content -LiteralPath (Join-Path $TempBackupSet "django-swimcrm.dump") -Value "fake django dump" -Encoding UTF8
Set-Content -LiteralPath (Join-Path $TempBackupSet "nocobase-nocobase_hybrid.dump") -Value "fake nocobase dump" -Encoding UTF8
$fakeDjangoDumpHash = (Get-FileHash -LiteralPath (Join-Path $TempBackupSet "django-swimcrm.dump") -Algorithm SHA256).Hash.ToLowerInvariant()
$fakeNocoBaseDumpHash = (Get-FileHash -LiteralPath (Join-Path $TempBackupSet "nocobase-nocobase_hybrid.dump") -Algorithm SHA256).Hash.ToLowerInvariant()
@{
    created_at = (Get-Date).ToString("o")
    backup_set_dir = $TempBackupSet
    django_database = "swimcrm"
    nocobase_database = "nocobase_hybrid"
    django_dump_sha256 = $fakeDjangoDumpHash
    nocobase_dump_sha256 = $fakeNocoBaseDumpHash
    media_archive_created = $false
    nocobase_storage_archive_created = $false
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $TempBackupSet "manifest.json") -Encoding UTF8

$devHybrid = Invoke-WithCleanEnv -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupHybrid -PlanOnly }
if ($devHybrid.exit_code -ne 0 -or $devHybrid.output -notmatch "nocobase_hybrid") {
    throw "Hybrid backup dev plan failed. Output: $($devHybrid.output)"
}
Write-Host "Hybrid backup dev plan check passed."

$prodMissing = Invoke-WithCleanEnv -Env @{ DJANGO_ENV = "production" } `
    -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupHybrid -PlanOnly }
Assert-FailsWith -Result $prodMissing -Pattern "BACKUP_DIR.*outside the source tree|BACKUP_DIR is required" -Label "Hybrid backup production default BACKUP_DIR"
Write-Host "Hybrid backup production default BACKUP_DIR guard passed."

$prodInsideBackup = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    BACKUP_DIR = (Join-Path $RepoRoot "backups")
    POSTGRES_DB = "swimcrm"
    POSTGRES_USER = "swimcrm"
    POSTGRES_PASSWORD = "release-check-db-password"
    MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-nocobase-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
} -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupHybrid -PlanOnly }
Assert-FailsWith -Result $prodInsideBackup -Pattern "outside the source tree" -Label "Hybrid backup source-tree BACKUP_DIR"
Write-Host "Hybrid backup source-tree guard passed."

$prodDefaultPassword = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    BACKUP_DIR = "C:\SwimCRMRuntime\backups"
    POSTGRES_DB = "swimcrm"
    POSTGRES_USER = "postgres"
    POSTGRES_PASSWORD = "postgres"
    MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-nocobase-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
} -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupHybrid -PlanOnly }
Assert-FailsWith -Result $prodDefaultPassword -Pattern "development default" -Label "Hybrid backup default password"
Write-Host "Hybrid backup default-password guard passed."

$prodHybrid = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    BACKUP_DIR = "C:\SwimCRMRuntime\backups"
    POSTGRES_DB = "swimcrm"
    POSTGRES_USER = "swimcrm"
    POSTGRES_PASSWORD = "release-check-db-password"
    MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-nocobase-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
} -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupHybrid -PlanOnly }
if ($prodHybrid.exit_code -ne 0 -or $prodHybrid.output -notmatch "C:\\\\SwimCRMRuntime\\\\backups") {
    throw "Hybrid backup production plan failed. Output: $($prodHybrid.output)"
}
Write-Host "Hybrid backup production plan check passed."

$prodRestore = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    POSTGRES_DB = "swimcrm"
    POSTGRES_USER = "swimcrm"
    POSTGRES_PASSWORD = "release-check-db-password"
    MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-nocobase-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
} -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RestoreHybrid -BackupSetDir $TempBackupSet -PlanOnly }
if ($prodRestore.exit_code -ne 0 -or $prodRestore.output -notmatch "nocobase_hybrid") {
    throw "Hybrid restore production plan failed. Output: $($prodRestore.output)"
}
Write-Host "Hybrid restore production plan check passed."

$hybridBackupSet = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    BACKUP_DIR = "C:\SwimCRMRuntime\backups"
} -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyHybridBackupSet -BackupSetDir $TempBackupSet -PlanOnly }
if ($hybridBackupSet.exit_code -ne 0 -or $hybridBackupSet.output -notmatch "nocobase_hybrid") {
    throw "Hybrid backup set verification plan failed. Output: $($hybridBackupSet.output)"
}
Write-Host "Hybrid backup set verification plan check passed."

if (Test-Path -LiteralPath $TempCorruptBackupSet) {
    Remove-Item -LiteralPath $TempCorruptBackupSet -Recurse -Force
}
Copy-Item -LiteralPath $TempBackupSet -Destination $TempCorruptBackupSet -Recurse
Add-Content -LiteralPath (Join-Path $TempCorruptBackupSet "django-swimcrm.dump") -Value "tampered"
$restoreCorruptDump = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    POSTGRES_DB = "swimcrm"
    POSTGRES_USER = "swimcrm"
    POSTGRES_PASSWORD = "release-check-db-password"
    MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-nocobase-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
} -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RestoreHybrid `
        -BackupSetDir $TempCorruptBackupSet
}
Assert-FailsWith -Result $restoreCorruptDump -Pattern "Django dump sha256 mismatch" -Label "Hybrid restore backup-set checksum guard"
Write-Host "Hybrid restore backup-set checksum guard passed."

$restoreWithoutConfirm = Invoke-WithCleanEnv -Env @{
    DJANGO_ENV = "production"
    POSTGRES_DB = "swimcrm"
    POSTGRES_USER = "swimcrm"
    POSTGRES_PASSWORD = "release-check-db-password"
    MEDIA_ROOT = "C:\SwimCRMRuntime\uploads"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-nocobase-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
} -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RestoreHybrid `
        -BackupSetDir $TempBackupSet `
        -SkipDjangoDb `
        -SkipNocoBaseDb `
        -SkipMedia `
        -SkipNocoBaseStorage
}
Assert-FailsWith -Result $restoreWithoutConfirm -Pattern "Restore is destructive.*-ConfirmRestore" -Label "Hybrid restore confirmation guard"
Write-Host "Hybrid restore confirmation guard passed."

$pgMissing = Invoke-WithCleanEnv -Env @{ DJANGO_ENV = "production" } `
    -Command { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupPg -PlanOnly }
Assert-FailsWith -Result $pgMissing -Pattern "BACKUP_DIR.*outside the source tree|BACKUP_DIR is required" -Label "PostgreSQL backup default BACKUP_DIR"
Write-Host "PostgreSQL backup default BACKUP_DIR guard passed."

Remove-Item -LiteralPath $TempBackupSet -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $TempCorruptBackupSet -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Backup/restore guard checks passed."
