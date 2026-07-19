[CmdletBinding()]
param(
    [string]$Handoff = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ArchiveVerifier = Join-Path $RepoRoot "scripts\verify-release-source-archive.ps1"
$LocalReleaseCandidate = Join-Path $RepoRoot "scripts\verify-local-release-candidate.ps1"

if ([string]::IsNullOrWhiteSpace($Handoff)) {
    $Handoff = Join-Path $RepoRoot "docs\RELEASE_HANDOFF.json"
}
elseif (-not [System.IO.Path]::IsPathRooted($Handoff)) {
    $Handoff = Join-Path $RepoRoot $Handoff
}

if (-not (Test-Path -LiteralPath $Handoff)) {
    throw "Release handoff does not exist: $Handoff. Run scripts\new-release-handoff.cmd -Force first."
}
if (-not (Test-Path -LiteralPath $ArchiveVerifier)) {
    throw "Release archive verifier not found at $ArchiveVerifier."
}
if (-not (Test-Path -LiteralPath $LocalReleaseCandidate)) {
    throw "Local release candidate verifier not found at $LocalReleaseCandidate."
}

$handoffPath = (Resolve-Path -LiteralPath $Handoff).Path
$handoffData = Get-Content -LiteralPath $handoffPath -Raw | ConvertFrom-Json

$currentCommit = ((& git -C $RepoRoot rev-parse HEAD) -join "").Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Release handoff verification requires a git work tree."
}
$currentShort = ((& git -C $RepoRoot rev-parse --short=12 HEAD) -join "").Trim()

$planOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LocalReleaseCandidate -PlanOnly
if ($LASTEXITCODE -ne 0) {
    throw "Local release candidate plan failed with exit code $LASTEXITCODE."
}
$releasePlan = ($planOutput -join "`n") | ConvertFrom-Json

if ($handoffData.release_candidate.commit_sha -ne $currentCommit) {
    throw "Release handoff is stale. Expected commit $currentCommit but found $($handoffData.release_candidate.commit_sha)."
}
if ($handoffData.release_candidate.short_sha -ne $currentShort) {
    throw "Release handoff short_sha is stale. Expected $currentShort but found $($handoffData.release_candidate.short_sha)."
}
if ($handoffData.release_candidate.source_tree -ne "clean") {
    throw "Release handoff must be generated from a clean source tree."
}

$manifestPath = [string]$handoffData.release_source_archive.manifest_path
if ([string]::IsNullOrWhiteSpace($manifestPath)) {
    throw "Release handoff release_source_archive.manifest_path is required."
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Release handoff archive manifest does not exist: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.commit_sha -ne $currentCommit) {
    throw "Release archive manifest commit_sha does not match current HEAD."
}
if ($manifest.archive_sha256 -ne $handoffData.release_source_archive.archive_sha256) {
    throw "Release handoff archive_sha256 does not match the release archive manifest."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ArchiveVerifier $manifestPath
if ($LASTEXITCODE -ne 0) {
    throw "Release source archive verification failed with exit code $LASTEXITCODE."
}

$requiredActions = @(
    "configure_git_remote",
    "push_release_branch",
    "capture_github_actions_release_check_url",
    "capture_github_actions_postgres_backend_check_url",
    "run_target_host_production_env_preflight",
    "run_target_host_live_hybrid_health",
    "run_target_host_hybrid_backup_restore_drill",
    "fill_docs_production_cutover_evidence_json",
    "run_scripts_verify_production_cutover_evidence_cmd"
)
$pendingActions = @($handoffData.pending_external_actions)
foreach ($action in $requiredActions) {
    if ($pendingActions -notcontains $action) {
        throw "Release handoff is missing pending external action: $action"
    }
}

$operatorChecklist = @($handoffData.operator_checklist)
if ($operatorChecklist.Count -lt $requiredActions.Count) {
    throw "Release handoff operator_checklist must include every pending external action."
}
foreach ($action in $requiredActions) {
    $checklistItem = $operatorChecklist | Where-Object { $_.id -eq $action } | Select-Object -First 1
    if (-not $checklistItem) {
        throw "Release handoff operator_checklist is missing action: $action"
    }
    if ([string]::IsNullOrWhiteSpace([string]$checklistItem.title)) {
        throw "Release handoff operator_checklist item '$action' is missing title."
    }
    if ([string]::IsNullOrWhiteSpace([string]$checklistItem.command)) {
        throw "Release handoff operator_checklist item '$action' is missing command."
    }
    if ([string]::IsNullOrWhiteSpace([string]$checklistItem.expected_evidence)) {
        throw "Release handoff operator_checklist item '$action' is missing expected_evidence."
    }
    if ($checklistItem.stop_if_missing -ne $true) {
        throw "Release handoff operator_checklist item '$action' must stop if evidence is missing."
    }
}
foreach ($item in $operatorChecklist) {
    if ($pendingActions -notcontains $item.id) {
        throw "Release handoff operator_checklist contains unknown pending action: $($item.id)"
    }
}

$handoffBlockerIds = @($handoffData.release_blockers | ForEach-Object { $_.id } | Sort-Object)
$planBlockerIds = @($releasePlan.release_blockers | ForEach-Object { $_.id } | Sort-Object)
$handoffBlockerText = $handoffBlockerIds -join "|"
$planBlockerText = $planBlockerIds -join "|"
if ($handoffBlockerText -ne $planBlockerText) {
    throw "Release handoff blockers drifted. Expected [$planBlockerText] but found [$handoffBlockerText]."
}

$remoteState = [bool]$handoffData.repository_remote.configured
if ($remoteState -ne [bool]$releasePlan.repository_remote.configured) {
    throw "Release handoff repository_remote.configured drifted from the current release plan."
}
foreach ($remote in @($releasePlan.repository_remote.remotes)) {
    if (@($handoffData.repository_remote.remotes) -notcontains $remote) {
        throw "Release handoff repository_remote.remotes is missing current remote: $remote"
    }
}

Write-Host "Release handoff verified."
Write-Host "commit_sha: $currentCommit"
Write-Host "archive_sha256: $($handoffData.release_source_archive.archive_sha256)"
