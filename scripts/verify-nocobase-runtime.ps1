[CmdletBinding()]
param(
    [switch]$AllowMissingLocalRuntime
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RunScript = Join-Path $RepoRoot "scripts\run-nocobase-runtime.ps1"
$StartScript = Join-Path $RepoRoot "scripts\start-nocobase-runtime.ps1"
$EnvNames = @(
    "DJANGO_ENV",
    "APP_ENV",
    "NOCOBASE_APP_ENV",
    "NOCOBASE_APP_KEY",
    "NOCOBASE_APP_ROOT",
    "NOCOBASE_APP_PORT",
    "NOCOBASE_DB_HOST",
    "NOCOBASE_DB_PORT",
    "NOCOBASE_DB_DATABASE",
    "NOCOBASE_DB_USER",
    "NOCOBASE_DB_PASSWORD",
    "NOCOBASE_ROOT_USERNAME",
    "NOCOBASE_ROOT_EMAIL",
    "NOCOBASE_ROOT_PASSWORD",
    "NOCOBASE_ROOT_NICKNAME",
    "NOCOBASE_STORAGE_DIR"
)

function Assert-FileContains {
    param(
        [string]$Path,
        [string[]]$Patterns,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label was not found at $Path."
    }

    $text = Get-Content -LiteralPath $Path -Raw
    foreach ($pattern in $Patterns) {
        if ($text -notmatch $pattern) {
            throw "$Label does not contain required pattern: $pattern"
        }
    }
}

function Invoke-NocoBasePlan {
    param([hashtable]$Env = @{})

    $saved = @{}
    foreach ($name in $EnvNames) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
        [Environment]::SetEnvironmentVariable($name, $null, "Process")
    }

    try {
        foreach ($key in $Env.Keys) {
            [Environment]::SetEnvironmentVariable($key, $Env[$key], "Process")
        }
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RunScript -PlanOnly 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        return @{
            exit_code = $exitCode
            output = ($output -join "`n")
        }
    }
    finally {
        foreach ($name in $EnvNames) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process")
        }
    }
}

$dev = Invoke-NocoBasePlan
if ($dev.exit_code -ne 0) {
    throw "Development NocoBase plan failed unexpectedly. Output: $($dev.output)"
}
if ($dev.output -notmatch '"app_env":\s+"development"') {
    throw "Development NocoBase plan did not report app_env=development."
}

$hasLocalPackage = $dev.output -match '"package_json_exists":\s+true'
$hasLocalCli = $dev.output -match '"cli_entry_exists":\s+true'
if ($hasLocalPackage -and $hasLocalCli) {
    if ($dev.output -notmatch '"nocobase_app_version":\s+"2\.1\.24"') {
        throw "Development NocoBase plan did not fingerprint the expected @nocobase/app version. Output: $($dev.output)"
    }
}
elseif ($AllowMissingLocalRuntime) {
    Write-Host "NocoBase local runtime fingerprint skipped: ignored runtime tree is not present in this checkout."
}
else {
    throw "Development NocoBase plan did not find the local NocoBase runtime. Run scripts\init-nocobase-hybrid.cmd and ensure swimcrm-hybrid\source exists. Output: $($dev.output)"
}
Write-Host "NocoBase runtime dev plan check passed."

$missing = Invoke-NocoBasePlan -Env @{ NOCOBASE_APP_ENV = "production" }
if ($missing.exit_code -eq 0 -or $missing.output -notmatch "NOCOBASE_APP_KEY is required") {
    throw "NocoBase production plan did not reject missing NOCOBASE_APP_KEY. Output: $($missing.output)"
}
Write-Host "NocoBase production missing-secret guard passed."

$defaultPassword = Invoke-NocoBasePlan -Env @{
    NOCOBASE_APP_ENV = "production"
    NOCOBASE_APP_KEY = "release-check-nocobase-app-key"
    NOCOBASE_APP_ROOT = "C:\SwimCRMRuntime\nocobase-app"
    NOCOBASE_DB_HOST = "127.0.0.1"
    NOCOBASE_DB_PORT = "5432"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "postgres"
    NOCOBASE_DB_PASSWORD = "postgres"
    NOCOBASE_ROOT_PASSWORD = "not-the-dev-root-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
}
if ($defaultPassword.exit_code -eq 0 -or $defaultPassword.output -notmatch "development default") {
    throw "NocoBase production plan did not reject default DB password. Output: $($defaultPassword.output)"
}
Write-Host "NocoBase production DB password guard passed."

$insideAppRoot = Invoke-NocoBasePlan -Env @{
    NOCOBASE_APP_ENV = "production"
    NOCOBASE_APP_KEY = "release-check-nocobase-app-key"
    NOCOBASE_APP_ROOT = (Join-Path $RepoRoot "swimcrm-hybrid\source")
    NOCOBASE_DB_HOST = "127.0.0.1"
    NOCOBASE_DB_PORT = "5432"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-db-password"
    NOCOBASE_ROOT_PASSWORD = "not-the-dev-root-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
}
if ($insideAppRoot.exit_code -eq 0 -or $insideAppRoot.output -notmatch "outside the source tree") {
    throw "NocoBase production plan did not reject source-tree app root. Output: $($insideAppRoot.output)"
}
Write-Host "NocoBase production app root guard passed."

$insideStorage = Invoke-NocoBasePlan -Env @{
    NOCOBASE_APP_ENV = "production"
    NOCOBASE_APP_KEY = "release-check-nocobase-app-key"
    NOCOBASE_APP_ROOT = "C:\SwimCRMRuntime\nocobase-app"
    NOCOBASE_DB_HOST = "127.0.0.1"
    NOCOBASE_DB_PORT = "5432"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-db-password"
    NOCOBASE_ROOT_PASSWORD = "not-the-dev-root-password"
    NOCOBASE_STORAGE_DIR = (Join-Path $RepoRoot "swimcrm-hybrid\source\storage")
}
if ($insideStorage.exit_code -eq 0 -or $insideStorage.output -notmatch "outside the source tree") {
    throw "NocoBase production plan did not reject source-tree storage. Output: $($insideStorage.output)"
}
Write-Host "NocoBase production storage guard passed."

$production = Invoke-NocoBasePlan -Env @{
    NOCOBASE_APP_ENV = "production"
    NOCOBASE_APP_KEY = "release-check-nocobase-app-key"
    NOCOBASE_APP_ROOT = "C:\SwimCRMRuntime\nocobase-app"
    NOCOBASE_DB_HOST = "127.0.0.1"
    NOCOBASE_DB_PORT = "5432"
    NOCOBASE_DB_DATABASE = "nocobase_hybrid"
    NOCOBASE_DB_USER = "nocobase"
    NOCOBASE_DB_PASSWORD = "release-check-db-password"
    NOCOBASE_ROOT_PASSWORD = "not-the-dev-root-password"
    NOCOBASE_STORAGE_DIR = "C:\SwimCRMRuntime\nocobase-storage"
}
if ($production.exit_code -ne 0) {
    throw "NocoBase production plan failed unexpectedly. Output: $($production.output)"
}
if ($production.output -notmatch '"app_env":\s+"production"') {
    throw "NocoBase production plan did not report app_env=production."
}
Write-Host "NocoBase runtime production plan check passed."

Assert-FileContains -Path $StartScript -Label "NocoBase background startup helper" -Patterns @(
    "Start-Process",
    "-WindowStyle Hidden",
    "WaitForHealth",
    "check-nocobase-health\.ps1",
    "did not become healthy"
)
Write-Host "NocoBase background startup helper check passed."

Write-Host "NocoBase runtime checks passed."
