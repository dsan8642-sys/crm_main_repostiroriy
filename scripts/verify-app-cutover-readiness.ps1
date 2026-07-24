[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

$RequiredFiles = @(
    "docs\CRM_CORE_SPEC.md",
    "docs\PRODUCTION_CUTOVER_EVIDENCE.example.json",
    "docs\OPERATIONS.md",
    "scripts\check-app-health.ps1",
    "scripts\check-app-health.cmd",
    "scripts\check-production-env.ps1",
    "scripts\check-production-env.cmd",
    "scripts\verify-api-contract-docs.ps1",
    "scripts\verify-api-contract-docs.cmd",
    "scripts\verify_api_contract_docs.py",
    "scripts\verify-ci-release-workflow.ps1",
    "scripts\verify-ci-release-workflow.cmd",
    "scripts\verify_ci_release_workflow.py",
    "scripts\verify-release-source-manifests.ps1",
    "scripts\verify-release-source-manifests.cmd",
    "scripts\verify_release_source_manifests.py",
    "scripts\build-release-source.ps1",
    "scripts\build-release-source.cmd",
    "scripts\verify-release-source-archive.ps1",
    "scripts\verify-release-source-archive.cmd",
    "scripts\install-release-on-target-host.ps1",
    "scripts\install-release-on-target-host.cmd",
    "scripts\verify-target-host-release-install.ps1",
    "scripts\verify-target-host-release-install.cmd",
    "scripts\acknowledge-production-rollback.ps1",
    "scripts\acknowledge-production-rollback.cmd",
    "scripts\verify-local-release-candidate.ps1",
    "scripts\verify-local-release-candidate.cmd",
    "scripts\verify-production-cutover-evidence.ps1",
    "scripts\verify-production-cutover-evidence.cmd",
    "scripts\verify_production_cutover_evidence.py",
    "scripts\new-production-cutover-evidence.ps1",
    "scripts\new-production-cutover-evidence.cmd",
    "scripts\new_production_cutover_evidence.py",
    "scripts\backup-pg.cmd",
    "scripts\verify-pg-restore.cmd"
)

function Add-Check {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [string]$Name,
        [bool]$Ok,
        [object]$Details = $null
    )
    $Checks.Add([ordered]@{
        name = $Name
        ok = $Ok
        details = $Details
    }) | Out-Null
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Command
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $Command 2>&1
        $exitCode = $LASTEXITCODE
    }
    catch {
        $output = @($_.Exception.Message)
        $exitCode = 1
    }
    finally {
        $ErrorActionPreference = $previous
    }
    return [ordered]@{
        name = $Name
        ok = ($exitCode -eq 0)
        exit_code = $exitCode
        output = (($output | Where-Object { "$_" -notmatch "^System\.Management\.Automation\.RemoteException$" }) -join "`n")
    }
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Backend venv not found at $Python."
}

$checks = [System.Collections.Generic.List[object]]::new()

$missingFiles = @()
foreach ($relative in $RequiredFiles) {
    $path = Join-Path $RepoRoot $relative
    if (-not (Test-Path -LiteralPath $path)) {
        $missingFiles += $relative
    }
}
Add-Check -Checks $checks -Name "required release artifacts exist" -Ok ($missingFiles.Count -eq 0) `
    -Details @{ missing = $missingFiles }

$healthPlan = Invoke-Step -Name "App health plan" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\check-app-health.ps1") -RequireHttps -RequireOpsOk -PlanOnly
}
Add-Check -Checks $checks -Name $healthPlan.name -Ok $healthPlan.ok -Details $healthPlan

$releaseTree = Invoke-Step -Name "Release tree artifact scan" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-release-tree.ps1")
}
Add-Check -Checks $checks -Name $releaseTree.name -Ok $releaseTree.ok -Details $releaseTree

$releaseSourceManifests = Invoke-Step -Name "Tracked release source manifests" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-release-source-manifests.ps1") -RequireTracked
}
Add-Check -Checks $checks -Name $releaseSourceManifests.name -Ok $releaseSourceManifests.ok -Details $releaseSourceManifests

$result = [ordered]@{
    ok = -not ($checks | Where-Object { -not $_.ok })
    generated_at = (Get-Date).ToString("o")
    objective = "SwimCRM Django production cutover readiness"
    checks = $checks
}

$result | ConvertTo-Json -Depth 20

if (-not $result.ok) {
    exit 1
}
