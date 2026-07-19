[CmdletBinding()]
param(
    [switch]$AllowMissingLocalNocoBaseRuntime
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "swimcrm"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

$RequiredFiles = @(
    "docs\CRM_CORE_SPEC.md",
    "docs\NOCOBASE_BOUNDARY_MAP.md",
    "docs\NOCOBASE_HYBRID_BOOTSTRAP.md",
    "docs\NOCOBASE_FIRST_SCREENS.json",
    "docs\NOCOBASE_SCREEN_BUILD_PACK.json",
    "docs\PRODUCTION_CUTOVER_EVIDENCE.example.json",
    "docs\OPERATIONS.md",
    "scripts\run-nocobase-runtime.ps1",
    "scripts\start-nocobase-runtime.ps1",
    "scripts\verify-nocobase-prerequisites.cmd",
    "scripts\verify-nocobase-prerequisites.ps1",
    "scripts\verify-nocobase-runtime.cmd",
    "scripts\verify-nocobase-runtime.ps1",
    "scripts\verify-nocobase-blueprint.cmd",
    "scripts\verify-nocobase-blueprint.ps1",
    "scripts\verify-nocobase-build-pack.cmd",
    "scripts\verify-nocobase-build-pack.ps1",
    "scripts\verify-nocobase-api-smoke.cmd",
    "scripts\verify-nocobase-api-smoke.ps1",
    "scripts\verify-hybrid-cutover-readiness.cmd",
    "scripts\backup-hybrid.ps1",
    "scripts\backup-hybrid.cmd",
    "scripts\restore-hybrid.ps1",
    "scripts\restore-hybrid.cmd",
    "scripts\verify-hybrid-backup-set.ps1",
    "scripts\verify-hybrid-backup-set.cmd",
    "scripts\check-hybrid-health.ps1",
    "scripts\check-hybrid-health.cmd",
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
    "scripts\verify-local-release-candidate.ps1",
    "scripts\verify-local-release-candidate.cmd",
    "scripts\verify-production-cutover-evidence.ps1",
    "scripts\verify-production-cutover-evidence.cmd",
    "scripts\verify_production_cutover_evidence.py",
    "scripts\new-production-cutover-evidence.ps1",
    "scripts\new-production-cutover-evidence.cmd",
    "scripts\new_production_cutover_evidence.py",
    "scripts\verify-backup-restore-guards.cmd",
    "swimcrm\common\nocobase_blueprint.py",
    "swimcrm\portal\nocobase_contract.py",
    "swimcrm\portal\nocobase_views.py"
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
Add-Check -Checks $checks -Name "required hybrid artifacts exist" -Ok ($missingFiles.Count -eq 0) `
    -Details @{ missing = $missingFiles }

$blueprintResult = $null
Push-Location $BackendDir
try {
    $env:DJANGO_SETTINGS_MODULE = "config.settings"
    $blueprintJson = & $Python -c "import django, json; django.setup(); from common.nocobase_blueprint import validate_nocobase_blueprint; print(json.dumps(validate_nocobase_blueprint(), ensure_ascii=False))"
    if ($LASTEXITCODE -ne 0) {
        Add-Check -Checks $checks -Name "NocoBase first screens blueprint validates" -Ok $false `
            -Details @{ output = ($blueprintJson -join "`n") }
    }
    else {
        $blueprintResult = ($blueprintJson -join "`n") | ConvertFrom-Json
        Add-Check -Checks $checks -Name "NocoBase first screens blueprint validates" -Ok ([bool]$blueprintResult.ok) `
            -Details $blueprintResult
    }
}
finally {
    Pop-Location
}

if ($blueprintResult) {
    Add-Check -Checks $checks -Name "NocoBase first screens cover production-safe phase 1" `
        -Ok ($blueprintResult.screens_count -ge 9) `
        -Details @{ screens_count = $blueprintResult.screens_count; minimum = 9 }
}

$buildPackResult = $null
Push-Location $BackendDir
try {
    $env:DJANGO_SETTINGS_MODULE = "config.settings"
    $buildPackJson = & $Python -c "import django, json; django.setup(); from common.nocobase_blueprint import validate_nocobase_build_pack; print(json.dumps(validate_nocobase_build_pack(), ensure_ascii=False))"
    if ($LASTEXITCODE -ne 0) {
        Add-Check -Checks $checks -Name "NocoBase screen build pack validates" -Ok $false `
            -Details @{ output = ($buildPackJson -join "`n") }
    }
    else {
        $buildPackResult = ($buildPackJson -join "`n") | ConvertFrom-Json
        Add-Check -Checks $checks -Name "NocoBase screen build pack validates" -Ok ([bool]$buildPackResult.ok) `
            -Details $buildPackResult
    }
}
finally {
    Pop-Location
}

$runtime = Invoke-Step -Name "NocoBase runtime guards" -Command {
    $args = @()
    if ($AllowMissingLocalNocoBaseRuntime) {
        $args += "-AllowMissingLocalRuntime"
    }
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-nocobase-runtime.ps1") @args
}
Add-Check -Checks $checks -Name $runtime.name -Ok $runtime.ok -Details $runtime

$prerequisites = Invoke-Step -Name "NocoBase runtime prerequisites" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-nocobase-prerequisites.ps1")
}
Add-Check -Checks $checks -Name $prerequisites.name -Ok $prerequisites.ok -Details $prerequisites

$apiSmoke = Invoke-Step -Name "NocoBase API build-pack smoke" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-nocobase-api-smoke.ps1")
}
Add-Check -Checks $checks -Name $apiSmoke.name -Ok $apiSmoke.ok -Details $apiSmoke

$backupRestore = Invoke-Step -Name "Hybrid backup/restore guards" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-backup-restore-guards.ps1")
}
Add-Check -Checks $checks -Name $backupRestore.name -Ok $backupRestore.ok -Details $backupRestore

$healthPlan = Invoke-Step -Name "Hybrid health plan" -Command {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\check-hybrid-health.ps1") -RequireHttps -RequireOpsOk -PlanOnly
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
    objective = "Hybrid Rewrite под NocoBase production cutover readiness"
    checks = $checks
}

$result | ConvertTo-Json -Depth 20

if (-not $result.ok) {
    exit 1
}
