[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:13000",
    [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = "Stop"

$healthUrl = $BaseUrl.TrimEnd("/") + "/api/__health_check"

try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec $TimeoutSeconds
}
catch {
    throw "NocoBase health check failed for $healthUrl. $($_.Exception.Message)"
}

if ($response.StatusCode -ne 200) {
    throw "NocoBase health check returned HTTP $($response.StatusCode) for $healthUrl."
}

Write-Host "NocoBase health check passed: $healthUrl"
