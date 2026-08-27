[CmdletBinding()]
param(
    [string]$DjangoBaseUrl = $(if ($env:DJANGO_BASE_URL) { $env:DJANGO_BASE_URL } else { "http://127.0.0.1:8000" }),
    [string]$SessionCookie = $env:SWIMCRM_ADMIN_SESSION_COOKIE,
    [int]$TimeoutSeconds = 10,
    [switch]$RequireHttps,
    [switch]$RequireOpsOk,
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

$plan = [ordered]@{
    django_health = Join-Url $DjangoBaseUrl "/api/health/"
    admin_ops_status = Join-Url $DjangoBaseUrl "/api/admin/ops-status/"
    requires_admin_session = [bool]$RequireOpsOk
    requires_https = [bool]$RequireHttps
    requires_ops_ok = [bool]$RequireOpsOk
    timeout_seconds = $TimeoutSeconds
}

if ($PlanOnly) {
    $plan | ConvertTo-Json -Depth 4
    return
}

if ($RequireHttps) {
    if ($DjangoBaseUrl -notmatch "^https://") {
        throw "DJANGO_BASE_URL must use https:// when -RequireHttps is set."
    }
}

$djangoHealth = Invoke-JsonGet -Url $plan.django_health
if ($djangoHealth.status -ne "ok") {
    throw "Django health check did not return status=ok."
}
Write-Host "Django health check passed: $($plan.django_health)"

if ($RequireOpsOk) {
    if ([string]::IsNullOrWhiteSpace($SessionCookie)) {
        throw "An admin session cookie is required to read /api/admin/ops-status/ when -RequireOpsOk is set. Pass -SessionCookie or set SWIMCRM_ADMIN_SESSION_COOKIE."
    }
    $opsStatus = Invoke-JsonGet -Url $plan.admin_ops_status -Headers @{ Cookie = $SessionCookie }
    if ($opsStatus.status -ne "ok") {
        throw "Operations status must be ok when -RequireOpsOk is set. Current status: $($opsStatus.status)."
    }
    Write-Host "Django operations status: $($opsStatus.status)"
    Write-Host "Operations status ok requirement passed."
}

if ($RequireHttps) {
    Write-Host "HTTPS live endpoint requirement passed."
}
Write-Host "App health check passed."
