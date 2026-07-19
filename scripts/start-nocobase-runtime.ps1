param(
    [string]$AppRoot = $(if ($env:NOCOBASE_APP_ROOT) { $env:NOCOBASE_APP_ROOT } else { Join-Path (Split-Path -Parent $PSScriptRoot) "swimcrm-hybrid\source" }),
    [string]$LogDir = $(if ($env:NOCOBASE_LOG_DIR) { $env:NOCOBASE_LOG_DIR } else { Join-Path $AppRoot "storage\logs" }),
    [string]$BaseUrl = $(if ($env:NOCOBASE_BASE_URL) { $env:NOCOBASE_BASE_URL } else { "http://127.0.0.1:13000" }),
    [int]$StartupTimeoutSeconds = 180,
    [switch]$WaitForHealth
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "run-nocobase-runtime.ps1"
$stdoutLog = Join-Path $LogDir "direct-runtime.out.log"
$stderrLog = Join-Path $LogDir "direct-runtime.err.log"
$healthScript = Join-Path $PSScriptRoot "check-nocobase-health.ps1"

if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $scriptPath,
    "-AppRoot",
    $AppRoot
)

$process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru

Write-Host "NocoBase runtime process started: pid=$($process.Id)"
Write-Host "NocoBase runtime stdout: $stdoutLog"
Write-Host "NocoBase runtime stderr: $stderrLog"

if (-not $WaitForHealth) {
    return
}

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$lastError = $null
while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
        throw "NocoBase runtime exited before health check passed. ExitCode=$($process.ExitCode). See $stdoutLog and $stderrLog."
    }

    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $healthScript -BaseUrl $BaseUrl -TimeoutSeconds 5
        if ($LASTEXITCODE -eq 0) {
            Write-Host "NocoBase runtime is healthy: $BaseUrl"
            return
        }
    }
    catch {
        $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 3
}

throw "NocoBase runtime did not become healthy within $StartupTimeoutSeconds seconds at $BaseUrl. Last error: $lastError. See $stdoutLog and $stderrLog."
