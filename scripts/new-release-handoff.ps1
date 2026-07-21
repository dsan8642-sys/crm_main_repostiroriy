[CmdletBinding()]
param(
    [string]$Output = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalReleaseCandidate = Join-Path $RepoRoot "scripts\verify-local-release-candidate.ps1"

if ([string]::IsNullOrWhiteSpace($Output)) {
    $Output = Join-Path $RepoRoot "docs\RELEASE_HANDOFF.json"
}
elseif (-not [System.IO.Path]::IsPathRooted($Output)) {
    $Output = Join-Path $RepoRoot $Output
}

if ((Test-Path -LiteralPath $Output) -and -not $Force) {
    throw "Refusing to overwrite existing release handoff: $Output. Pass -Force to overwrite it."
}

& git -C $RepoRoot rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Release handoff generation requires a git work tree."
}

$commitSha = ((& git -C $RepoRoot rev-parse HEAD) -join "").Trim()
$shortSha = ((& git -C $RepoRoot rev-parse --short=12 HEAD) -join "").Trim()
$branch = ((& git -C $RepoRoot branch --show-current) -join "").Trim()
$status = @(& git -C $RepoRoot status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$remotes = @(& git -C $RepoRoot remote | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

$planOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LocalReleaseCandidate -PlanOnly
if ($LASTEXITCODE -ne 0) {
    throw "Local release candidate plan failed with exit code $LASTEXITCODE."
}
$releasePlan = ($planOutput -join "`n") | ConvertFrom-Json

$releaseManifestPath = Join-Path $RepoRoot ("releases\swimcrm-release-{0}.manifest.json" -f $shortSha)
$releaseArchive = $null
if (Test-Path -LiteralPath $releaseManifestPath) {
    $releaseArchive = Get-Content -LiteralPath $releaseManifestPath -Raw | ConvertFrom-Json
}

$handoffBlockers = @($releasePlan.release_blockers)
if (-not $releaseArchive) {
    $handoffBlockers += [ordered]@{
        id = "missing_release_source_archive"
        severity = "handoff_blocker"
        message = "Run scripts\verify-local-release-candidate.cmd to build and verify the release source archive for this commit."
    }
}

$operatorChecklist = @(
    [ordered]@{
        id = "configure_git_remote"
        title = "Configure the Git remote for the release repository."
        command = "git remote add origin <repository-url>"
        expected_evidence = "git remote -v shows the production release repository."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "push_release_branch"
        title = "Push the release branch for CI."
        command = "git push -u origin $branch"
        expected_evidence = "The pushed branch contains commit $commitSha."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "capture_github_actions_release_check_url"
        title = "Capture the GitHub Actions release-check run URL and artifact name."
        command = "Open the release-check workflow run for commit $commitSha."
        expected_evidence = "GitHub Actions run URL, passing release-check job, and artifact swimcrm-release-source-$commitSha."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "capture_github_actions_postgres_backend_check_url"
        title = "Capture the GitHub Actions postgres-backend-check run URL."
        command = "Open the postgres-backend-check job for commit $commitSha."
        expected_evidence = "GitHub Actions run URL proving postgres-backend-check passed for commit $commitSha."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "install_release_archive_on_target_host"
        title = "Install the verified release archive on the target host."
        command = "scripts\install-release-on-target-host.cmd -Manifest releases\swimcrm-release-$shortSha.manifest.json -InstallRoot <release-root> -NocoBaseAppRoot <nocobase-app-root> -NocoBaseStorageDir <nocobase-storage-dir> -RunInstall"
        expected_evidence = "Target-host release install completed; Target-host release install verified; Release archive extracted on target host; Release source archive manifest verified; Release source archive contents verified; Release source archive tracked file list verified; tracked_file_count; tracked_file_list_sha256; Backend dependencies installed; Root Node tooling installed; Frontend dependencies installed; Django migrations check passed; NocoBase app root outside source tree; NocoBase storage outside source tree."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "run_target_host_production_env_preflight"
        title = "Run target-host production environment preflight."
        command = "scripts\check-production-env.cmd"
        expected_evidence = "Production environment check passed; Runtime path settings passed; PostgreSQL production settings passed; Celery production settings passed; NocoBase production settings passed; HTTPS reverse-proxy settings passed."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "run_target_host_live_hybrid_health"
        title = "Run target-host live hybrid health."
        command = "scripts\check-hybrid-health.cmd -RequireHttps -RequireOpsOk"
        expected_evidence = "Hybrid health check passed; HTTPS live endpoint requirement passed; Operations status ok requirement passed; real https:// Django production URL; real https:// NocoBase production URL; nocobase_config_health; /api/nocobase/config/languages/."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "run_target_host_hybrid_backup_restore_drill"
        title = "Run target-host backup, restore-plan, and backup-set verification drill."
        command = "scripts\backup-hybrid.ps1; scripts\restore-hybrid.ps1 -PlanOnly; scripts\verify-hybrid-backup-set.cmd"
        expected_evidence = "Hybrid backup set written; Django dump sha256 OK with 64-character SHA256; NocoBase dump sha256 OK with 64-character SHA256; Django dump list OK; NocoBase dump list OK; Restore verification OK; Hybrid backup set verification OK."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "fill_docs_production_cutover_evidence_json"
        title = "Fill the production cutover evidence manifest with real evidence."
        command = "Copy docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json to docs\PRODUCTION_CUTOVER_EVIDENCE.json and replace pending placeholders."
        expected_evidence = "docs\PRODUCTION_CUTOVER_EVIDENCE.json contains only real production evidence for commit $commitSha and archive SHA256 $($releaseArchive.archive_sha256), including Release source archive contents verified, Release source archive tracked file list verified, tracked_file_count, tracked_file_list_sha256, and complete rollback acknowledgement from scripts\acknowledge-production-rollback.cmd: Rollback plan reviewed; stop writers; verified backup; restore; migrate --check; restart services; live smoke; Production rollback acknowledgement completed."
        stop_if_missing = $true
    },
    [ordered]@{
        id = "run_scripts_verify_production_cutover_evidence_cmd"
        title = "Verify the final production cutover evidence."
        command = "scripts\verify-production-cutover-evidence.cmd -RequireCurrentHead"
        expected_evidence = "Production cutover evidence verified."
        stop_if_missing = $true
    }
)

$handoff = [ordered]@{
    generated_at = (Get-Date).ToString("o")
    release_candidate = [ordered]@{
        commit_sha = $commitSha
        short_sha = $shortSha
        branch = $branch
        source_tree = if ($status.Count -eq 0) { "clean" } else { "dirty" }
    }
    repository_remote = [ordered]@{
        configured = ($remotes.Count -gt 0)
        remotes = $remotes
        required_for_ci_evidence = $true
    }
    release_source_archive = [ordered]@{
        manifest_path = $releaseManifestPath
        manifest_exists = [bool]$releaseArchive
        archive_path = if ($releaseArchive) { $releaseArchive.archive } else { $null }
        archive_sha256 = if ($releaseArchive) { $releaseArchive.archive_sha256 } else { $null }
        tracked_file_count = if ($releaseArchive) { $releaseArchive.tracked_file_count } else { $null }
        tracked_file_list_sha256 = if ($releaseArchive) { $releaseArchive.tracked_file_list_sha256 } else { $null }
    }
    production_cutover_evidence = [ordered]@{
        production_path = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.json"
        production_exists = Test-Path -LiteralPath (Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.json")
        draft_path = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json"
        draft_exists = Test-Path -LiteralPath (Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json")
    }
    release_blockers = @($handoffBlockers)
    operator_checklist = @($operatorChecklist)
    pending_external_actions = @(
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
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output) | Out-Null
$handoff | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Output -Encoding UTF8

Write-Host "Release handoff written: $Output"
Write-Host "Release handoff blockers: $(@($handoffBlockers).Count)"
