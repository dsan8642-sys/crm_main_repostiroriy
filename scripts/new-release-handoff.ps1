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
    }
    production_cutover_evidence = [ordered]@{
        production_path = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.json"
        production_exists = Test-Path -LiteralPath (Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.json")
        draft_path = Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json"
        draft_exists = Test-Path -LiteralPath (Join-Path $RepoRoot "docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json")
    }
    release_blockers = @($handoffBlockers)
    pending_external_actions = @(
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
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output) | Out-Null
$handoff | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Output -Encoding UTF8

Write-Host "Release handoff written: $Output"
Write-Host "Release handoff blockers: $(@($handoffBlockers).Count)"
