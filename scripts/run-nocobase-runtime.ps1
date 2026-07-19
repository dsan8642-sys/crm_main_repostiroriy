param(
    [string]$AppRoot = $(if ($env:NOCOBASE_APP_ROOT) { $env:NOCOBASE_APP_ROOT } else { Join-Path (Split-Path -Parent $PSScriptRoot) "swimcrm-hybrid\source" }),
    [string]$AppEnv = $(if ($env:NOCOBASE_APP_ENV) { $env:NOCOBASE_APP_ENV } else { $(if ($env:APP_ENV) { $env:APP_ENV } else { "development" }) }),
    [string]$AppKey = $env:NOCOBASE_APP_KEY,
    [string]$DbHost = $(if ($env:NOCOBASE_DB_HOST) { $env:NOCOBASE_DB_HOST } else { "localhost" }),
    [string]$DbPort = $(if ($env:NOCOBASE_DB_PORT) { $env:NOCOBASE_DB_PORT } else { "5432" }),
    [string]$DbName = $(if ($env:NOCOBASE_DB_DATABASE) { $env:NOCOBASE_DB_DATABASE } else { "nocobase_hybrid" }),
    [string]$DbUser = $(if ($env:NOCOBASE_DB_USER) { $env:NOCOBASE_DB_USER } else { "postgres" }),
    [string]$DbPassword = $(if ($env:NOCOBASE_DB_PASSWORD) { $env:NOCOBASE_DB_PASSWORD } else { "postgres" }),
    [string]$AppPort = $(if ($env:NOCOBASE_APP_PORT) { $env:NOCOBASE_APP_PORT } else { "13000" }),
    [string]$RootUsername = $(if ($env:NOCOBASE_ROOT_USERNAME) { $env:NOCOBASE_ROOT_USERNAME } else { "admin" }),
    [string]$RootEmail = $(if ($env:NOCOBASE_ROOT_EMAIL) { $env:NOCOBASE_ROOT_EMAIL } else { "admin@swimcrm.local" }),
    [string]$RootPassword = $(if ($env:NOCOBASE_ROOT_PASSWORD) { $env:NOCOBASE_ROOT_PASSWORD } else { "Admin!2026pass" }),
    [string]$RootNickname = $(if ($env:NOCOBASE_ROOT_NICKNAME) { $env:NOCOBASE_ROOT_NICKNAME } else { "Admin" }),
    [string]$StoragePath = $(if ($env:NOCOBASE_STORAGE_DIR) { $env:NOCOBASE_STORAGE_DIR } else { Join-Path $AppRoot "storage" }),
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Test-PathInside {
    param([string]$Child, [string]$Parent)
    $childPath = [System.IO.Path]::GetFullPath($Child)
    $parentPath = [System.IO.Path]::GetFullPath($Parent)
    return $childPath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $childPath.StartsWith($parentPath.TrimEnd("\") + "\", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-NocoBasePackageInfo {
    param([string]$Root)

    $packageJsonPath = Join-Path $Root "package.json"
    if (-not (Test-Path -LiteralPath $packageJsonPath)) {
        return @{
            package_json_exists = $false
            package_name = $null
            nocobase_app_version = $null
        }
    }

    $package = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    return @{
        package_json_exists = $true
        package_name = $package.name
        nocobase_app_version = $package.dependencies."@nocobase/app"
    }
}

function Assert-ProductionSecret {
    param(
        [string]$Name,
        [string]$Value,
        [int]$MinLength = 32
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "$Name is required when NocoBase runs in production."
    }
    if ($Value.Length -lt $MinLength -or $Value -match "dev-insecure|release-check|change-me|example|Admin!2026pass") {
        throw "$Name must be a real production secret at least 32 characters long, not a placeholder."
    }
}

$isProduction = $AppEnv -in @("prod", "production") -or $env:DJANGO_ENV -in @("prod", "production")
if ($isProduction) {
    foreach ($required in @(
            @{ Name = "NOCOBASE_APP_ROOT"; Value = $AppRoot },
            @{ Name = "NOCOBASE_DB_HOST"; Value = $DbHost },
            @{ Name = "NOCOBASE_DB_PORT"; Value = $DbPort },
            @{ Name = "NOCOBASE_DB_DATABASE"; Value = $DbName },
            @{ Name = "NOCOBASE_DB_USER"; Value = $DbUser },
            @{ Name = "NOCOBASE_DB_PASSWORD"; Value = $DbPassword },
            @{ Name = "NOCOBASE_STORAGE_DIR"; Value = $StoragePath }
        )) {
        if ([string]::IsNullOrWhiteSpace($required.Value)) {
            throw "$($required.Name) is required when NocoBase runs in production."
        }
    }
    Assert-ProductionSecret -Name "NOCOBASE_APP_KEY" -Value $AppKey -MinLength 32
    if ($DbPassword -eq "postgres") {
        throw "NOCOBASE_DB_PASSWORD must not use the development default in production."
    }
    if ($RootPassword -eq "Admin!2026pass") {
        throw "NOCOBASE_ROOT_PASSWORD must not use the development default in production."
    }
    if (Test-PathInside -Child $AppRoot -Parent $RepoRoot) {
        throw "NOCOBASE_APP_ROOT must be outside the source tree in production."
    }
    if (Test-PathInside -Child $StoragePath -Parent $RepoRoot) {
        throw "NOCOBASE_STORAGE_DIR must be outside the source tree in production."
    }
}

$cliEntry = Join-Path $AppRoot "node_modules\@nocobase\cli-v1\bin\index.js"
$packageInfo = Get-NocoBasePackageInfo -Root $AppRoot
$plan = [ordered]@{
    app_root = $AppRoot
    app_env = $AppEnv
    app_port = $AppPort
    api_base_path = "/api/"
    db_dialect = "postgres"
    db_host = $DbHost
    db_port = $DbPort
    db_database = $DbName
    db_user = $DbUser
    db_password_configured = -not [string]::IsNullOrWhiteSpace($DbPassword)
    app_key_configured = -not [string]::IsNullOrWhiteSpace($AppKey)
    root_username = $RootUsername
    root_email = $RootEmail
    root_password_configured = -not [string]::IsNullOrWhiteSpace($RootPassword)
    storage_path = $StoragePath
    yarn_cache_folder = Join-Path $RepoRoot ".yarn-cache"
    cli_entry = $cliEntry
    cli_entry_exists = Test-Path -LiteralPath $cliEntry
    package_json_exists = $packageInfo.package_json_exists
    package_name = $packageInfo.package_name
    nocobase_app_version = $packageInfo.nocobase_app_version
    yarn_lock_exists = Test-Path -LiteralPath (Join-Path $AppRoot "yarn.lock")
    node_modules_exists = Test-Path -LiteralPath (Join-Path $AppRoot "node_modules")
}

if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 4
    return
}

if (-not (Test-Path -LiteralPath $cliEntry)) {
    throw "NocoBase CLI entry was not found at $cliEntry."
}

$env:APP_ENV = $AppEnv
if (-not [string]::IsNullOrWhiteSpace($AppKey)) {
    $env:APP_KEY = $AppKey
}
$env:APP_PORT = $AppPort
$env:API_BASE_PATH = "/api/"
$env:DB_DIALECT = "postgres"
$env:DB_HOST = $DbHost
$env:DB_PORT = $DbPort
$env:DB_DATABASE = $DbName
$env:DB_USER = $DbUser
$env:DB_PASSWORD = $DbPassword
$env:INIT_ROOT_USERNAME = $RootUsername
$env:INIT_ROOT_EMAIL = $RootEmail
$env:INIT_ROOT_PASSWORD = $RootPassword
$env:INIT_ROOT_NICKNAME = $RootNickname
$env:YARN_CACHE_FOLDER = Join-Path $RepoRoot ".yarn-cache"
$env:STORAGE_PATH = $StoragePath

Set-Location $AppRoot
node.exe $cliEntry start --launch-mode direct
