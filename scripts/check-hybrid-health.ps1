[CmdletBinding()]
param(
    [string]$DjangoBaseUrl = $(if ($env:DJANGO_BASE_URL) { $env:DJANGO_BASE_URL } else { "http://127.0.0.1:8000" }),
    [string]$NocoBaseBaseUrl = $(if ($env:NOCOBASE_BASE_URL) { $env:NOCOBASE_BASE_URL } else { "http://127.0.0.1:13000" }),
    [string]$BridgeToken = $env:NOCOBASE_BRIDGE_TOKEN,
    [string]$ConfigToken = $env:NOCOBASE_CONFIG_TOKEN,
    [int]$TimeoutSeconds = 10,
    [switch]$AllowOpsCritical,
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

function Join-Url {
    param([string]$BaseUrl, [string]$Path)
    return $BaseUrl.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function Invoke-JsonGet {
    param(
        [string]$Url,
        [hashtable]$Headers = @{}
    )

    try {
        if ($Headers.Count -gt 0) {
            $response = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec $TimeoutSeconds
        }
        else {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
        }
    }
    catch {
        throw "GET $Url failed. $($_.Exception.Message)"
    }

    if ($response.StatusCode -ne 200) {
        throw "GET $Url returned HTTP $($response.StatusCode)."
    }

    try {
        return $response.Content | ConvertFrom-Json
    }
    catch {
        throw "GET $Url returned non-JSON content."
    }
}

function Invoke-HttpOk {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    }
    catch {
        throw "GET $Url failed. $($_.Exception.Message)"
    }

    if ($response.StatusCode -ne 200) {
        throw "GET $Url returned HTTP $($response.StatusCode)."
    }
}

$plan = [ordered]@{
    django_health = Join-Url $DjangoBaseUrl "/api/health/"
    nocobase_bridge_health = Join-Url $DjangoBaseUrl "/api/nocobase/health/"
    nocobase_ops_status = Join-Url $DjangoBaseUrl "/api/nocobase/ops-status/"
    nocobase_config_health = Join-Url $DjangoBaseUrl "/api/nocobase/config/languages/"
    nocobase_process_health = Join-Url $NocoBaseBaseUrl "/api/__health_check"
    requires_bridge_token = $true
    requires_config_token = $true
    timeout_seconds = $TimeoutSeconds
}

if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 4
    return
}

if ([string]::IsNullOrWhiteSpace($BridgeToken)) {
    throw "NOCOBASE_BRIDGE_TOKEN is required. Pass -BridgeToken or set the environment variable."
}
if ([string]::IsNullOrWhiteSpace($ConfigToken)) {
    throw "NOCOBASE_CONFIG_TOKEN is required. Pass -ConfigToken or set the environment variable."
}

$headers = @{ Authorization = "Bearer $BridgeToken" }
$configHeaders = @{ Authorization = "Bearer $ConfigToken" }

$djangoHealth = Invoke-JsonGet -Url $plan.django_health
if ($djangoHealth.status -ne "ok") {
    throw "Django health check did not return status=ok."
}
Write-Host "Django health check passed: $($plan.django_health)"

$bridgeHealth = Invoke-JsonGet -Url $plan.nocobase_bridge_health -Headers $headers
if (-not $bridgeHealth.ok) {
    throw "Django NocoBase bridge health did not return ok=true."
}
Write-Host "Django NocoBase bridge health passed: $($plan.nocobase_bridge_health)"

$opsStatus = Invoke-JsonGet -Url $plan.nocobase_ops_status -Headers $headers
if ($opsStatus.status -eq "critical" -and -not $AllowOpsCritical) {
    throw "Operations status is critical. Re-run with -AllowOpsCritical only for diagnostics, not for release approval."
}
Write-Host "Django operations status: $($opsStatus.status)"

$configHealth = Invoke-JsonGet -Url $plan.nocobase_config_health -Headers $configHeaders
if ($null -eq $configHealth.languages) {
    throw "Django NocoBase config health did not return a languages array."
}
Write-Host "Django NocoBase config health passed: $($plan.nocobase_config_health)"

Invoke-HttpOk -Url $plan.nocobase_process_health
Write-Host "NocoBase process health check passed: $($plan.nocobase_process_health)"

Write-Host "Hybrid health check passed."
