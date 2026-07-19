[CmdletBinding()]
param(
    [switch]$Postgres,
    [switch]$AllowMissingLocalNocoBaseRuntime,
    [switch]$SkipFullStackChecks,
    [switch]$SkipFrontendInstall,
    [switch]$SkipFrontendAudit,
    [switch]$SkipFrontendBrowserInstall,
    [switch]$SkipFrontendSmoke,
    [switch]$ForceArtifactOverwrite,
    [switch]$RequireProductionEvidence,
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReleaseCheckFull = Join-Path $RepoRoot "scripts\release-check-full.ps1"
$ReleaseSourceManifests = Join-Path $RepoRoot "scripts\verify-release-source-manifests.ps1"
$BuildReleaseSource = Join-Path $RepoRoot "scripts\build-release-source.ps1"
$VerifyReleaseSourceArchive = Join-Path $RepoRoot "scripts\verify-release-source-archive.ps1"
$CutoverEvidence = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.json"
$VerifyCutoverEvidence = Join-Path $RepoRoot "scripts\verify-production-cutover-evidence.ps1"

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

function Get-GitStatusSummary {
    param([string[]]$Lines)

    $normalizedLines = @($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $staged = @()
    $unstaged = @()
    $untracked = @()
    foreach ($line in $normalizedLines) {
        if ($line.StartsWith("??")) {
            $untracked += $line.Substring(3)
            continue
        }
        if ($line.Length -lt 3) {
            continue
        }
        $indexStatus = $line.Substring(0, 1)
        $worktreeStatus = $line.Substring(1, 1)
        $path = $line.Substring(3)
        if ($indexStatus -ne " ") {
            $staged += $path
        }
        if ($worktreeStatus -ne " ") {
            $unstaged += $path
        }
    }

    return [ordered]@{
        clean = ($normalizedLines.Count -eq 0)
        staged_count = $staged.Count
        unstaged_count = $unstaged.Count
        untracked_count = $untracked.Count
        staged = $staged
        unstaged = $unstaged
        untracked = $untracked
    }
}

function Get-ReleaseReviewCategory {
    param([string]$Path)

    if ($Path -match "^\.github/|^\.github\\") {
        return "ci"
    }
    if ($Path -match "^frontend/|^frontend\\") {
        return "frontend"
    }
    if ($Path -match "^swimcrm/|^swimcrm\\") {
        if ($Path -match "nocobase|localization|payroll|migrations|tests") {
            return "backend_core"
        }
        return "backend"
    }
    if ($Path -match "^scripts/|^scripts\\") {
        return "operations"
    }
    if ($Path -match "^docs/|^docs\\") {
        return "docs"
    }
    if ($Path -match "^package(-lock)?\.json$|^\.gitignore$") {
        return "root_release_manifests"
    }
    return "other"
}

function Test-ProductionCriticalPath {
    param([string]$Path)

    return ($Path -match "^\.github/|^\.github\\" -or
        $Path -match "^scripts/|^scripts\\" -or
        $Path -match "^docs/PRODUCTION_|^docs\\PRODUCTION_" -or
        $Path -match "^docs/NOCOBASE_|^docs\\NOCOBASE_" -or
        $Path -match "^docs/RELEASE_CANDIDATE_READINESS\.md$" -or
        $Path -match "^package(-lock)?\.json$" -or
        $Path -match "^frontend/package(-lock)?\.json$|^frontend\\package(-lock)?\.json$" -or
        $Path -match "migrations" -or
        $Path -match "settings\.py$" -or
        $Path -match "nocobase" -or
        $Path -match "payroll" -or
        $Path -match "backup|restore|release|cutover|readiness")
}

function Get-ReleaseReviewReport {
    param([object]$StatusSummary)

    $allPaths = @($StatusSummary.staged + $StatusSummary.unstaged + $StatusSummary.untracked)
    $categories = [ordered]@{}
    foreach ($path in $allPaths) {
        $category = Get-ReleaseReviewCategory -Path $path
        if (-not $categories.Contains($category)) {
            $categories[$category] = [ordered]@{
                count = 0
                paths = @()
            }
        }
        $categories[$category].count += 1
        $categories[$category].paths += $path
    }

    $critical = @($allPaths | Where-Object { Test-ProductionCriticalPath -Path $_ } | Sort-Object -Unique)

    return [ordered]@{
        groups = $categories
        production_critical_count = $critical.Count
        production_critical_changes = $critical
    }
}

function Get-ReleaseBlockers {
    param(
        [object]$StatusSummary,
        [bool]$CutoverEvidenceExists,
        [string]$Branch,
        [bool]$RemoteConfigured
    )

    $blockers = @()
    if (-not $StatusSummary.clean) {
        $blockers += [ordered]@{
            id = "dirty_source_tree"
            severity = "local_release_blocker"
            message = "Commit or stash local changes before building a release source archive."
        }
    }
    if ([string]::IsNullOrWhiteSpace($Branch)) {
        $blockers += [ordered]@{
            id = "detached_head"
            severity = "release_traceability_risk"
            message = "Create or switch to a named release branch before final release approval."
        }
    }
    if (-not $CutoverEvidenceExists) {
        $blockers += [ordered]@{
            id = "missing_production_cutover_evidence"
            severity = "production_ready_blocker"
            message = "Fill docs/PRODUCTION_CUTOVER_EVIDENCE.json with real CI and target-host evidence."
        }
    }
    if (-not $RemoteConfigured) {
        $blockers += [ordered]@{
            id = "missing_git_remote"
            severity = "ci_evidence_blocker"
            message = "Configure a Git remote and push the release branch to collect GitHub Actions evidence."
        }
    }
    return $blockers
}

& git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Local release candidate verification requires a git work tree."
}

$status = @(& git -C $RepoRoot status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$commitSha = ((& git -C $RepoRoot rev-parse HEAD) -join "").Trim()
$branch = ((& git -C $RepoRoot branch --show-current) -join "").Trim()
$remotes = @(& git -C $RepoRoot remote | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$remoteConfigured = ($remotes.Count -gt 0)
$statusSummary = Get-GitStatusSummary -Lines $status
$releaseReview = Get-ReleaseReviewReport -StatusSummary $statusSummary
$cutoverEvidenceExists = Test-Path -LiteralPath $CutoverEvidence
$releaseBlockers = Get-ReleaseBlockers -StatusSummary $statusSummary -CutoverEvidenceExists $cutoverEvidenceExists -Branch $branch -RemoteConfigured $remoteConfigured

if ($PlanOnly) {
    [ordered]@{
        ok = ($releaseBlockers.Count -eq 0)
        generated_at = (Get-Date).ToString("o")
        commit_sha = $commitSha
        branch = $branch
        branch_state = if ([string]::IsNullOrWhiteSpace($branch)) { "detached_head" } else { "named_branch" }
        repository_remote = [ordered]@{
            configured = $remoteConfigured
            remotes = $remotes
            required_for_ci_evidence = $true
        }
        source_tree = if ($statusSummary.clean) { "clean" } else { "dirty" }
        release_blockers = @($releaseBlockers)
        git_status = $statusSummary
        release_review = $releaseReview
        production_cutover_evidence = [ordered]@{
            path = $CutoverEvidence
            exists = $cutoverEvidenceExists
            required_for_production_ready = $true
        }
        planned_release_candidate_steps = @(
            "commit_or_stash_local_changes_until_git_status_is_clean",
            "run_scripts_verify_local_release_candidate_cmd",
            "build_and_verify_release_source_archive",
            "configure_git_remote",
            "push_release_branch",
            "capture_github_actions_release_check_url",
            "capture_github_actions_postgres_backend_check_url",
            "install_release_archive_on_target_host",
            "run_target_host_production_env_preflight",
            "run_target_host_live_hybrid_health",
            "run_target_host_hybrid_backup_restore_drill",
            "fill_docs_production_cutover_evidence_json",
            "run_scripts_verify_production_cutover_evidence_cmd"
        )
    } | ConvertTo-Json -Depth 8
    exit 0
}

if ($status) {
    throw "Local release candidate verification requires a clean git work tree. Commit or stash local changes first."
}

if (-not $SkipFullStackChecks) {
    $fullArgs = @()
    if ($Postgres) {
        $fullArgs += "-Postgres"
    }
    if ($AllowMissingLocalNocoBaseRuntime) {
        $fullArgs += "-AllowMissingLocalNocoBaseRuntime"
    }
    if ($SkipFrontendInstall) {
        $fullArgs += "-SkipFrontendInstall"
    }
    if ($SkipFrontendAudit) {
        $fullArgs += "-SkipFrontendAudit"
    }
    if ($SkipFrontendBrowserInstall) {
        $fullArgs += "-SkipFrontendBrowserInstall"
    }
    if ($SkipFrontendSmoke) {
        $fullArgs += "-SkipFrontendSmoke"
    }
    Invoke-Step "Full-stack release checks" {
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ReleaseCheckFull @fullArgs
    }
}

Invoke-Step "Tracked release source manifests" {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ReleaseSourceManifests -RequireTracked
}

$buildArgs = @()
if ($ForceArtifactOverwrite) {
    $buildArgs += "-Force"
}
Invoke-Step "Build release source archive" {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildReleaseSource @buildArgs
}

$shortSha = (& git -C $RepoRoot rev-parse --short=12 HEAD).Trim()
$manifestPath = Join-Path $RepoRoot "releases\swimcrm-release-$shortSha.manifest.json"
Invoke-Step "Verify release source archive" {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyReleaseSourceArchive $manifestPath
}

if (Test-Path -LiteralPath $CutoverEvidence) {
    Invoke-Step "Production cutover evidence" {
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyCutoverEvidence -Evidence $CutoverEvidence -RequireCurrentHead
    }
}
elseif ($RequireProductionEvidence) {
    throw "Production cutover evidence is required but missing: $CutoverEvidence"
}
else {
    Write-Host ""
    Write-Host "Production cutover evidence pending: docs\PRODUCTION_CUTOVER_EVIDENCE.json"
}

Write-Host ""
Write-Host "Local release candidate verified."
if (-not (Test-Path -LiteralPath $CutoverEvidence)) {
    Write-Host "Production-ready approval still requires target-host cutover evidence."
}
