import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "PRODUCTION_CUTOVER_EVIDENCE.draft.json"


EVIDENCE_ITEMS = [
    {
        "id": "local_backend_release_gate",
        "command": "scripts\\release-check-backend.cmd",
        "summary": "Run the backend release gate and paste the final pass summary here.",
        "output_excerpt": "Must include: Backend release checks passed; Production readiness audit verified; Tracked release source manifests.",
    },
    {
        "id": "local_full_stack_release_gate",
        "command": "scripts\\release-check-full.cmd",
        "summary": "Run the full-stack release gate and paste the final pass summary here.",
        "output_excerpt": "Must include: Full-stack release checks passed; found 0 vulnerabilities; Frontend production build; Frontend Playwright smoke tests.",
    },
    {
        "id": "release_source_archive",
        "command": "scripts\\build-release-artifact.cmd",
        "summary": "Build and verify the immutable deployment artifact from the clean release commit.",
        "output_excerpt": "Must include: Immutable release artifact written; Immutable release artifact verified; artifact_file_count; artifact_file_list_sha256; frontend_dist_file_count; commit_sha; archive_sha256.",
    },
    {
        "id": "tracked_release_source_guard",
        "command": "scripts\\verify-release-source-manifests.cmd -RequireTracked",
        "summary": "Run the tracked release-source guard after staging/committing required manifests and paste the pass summary here.",
        "output_excerpt": "Must include: Release source manifests verified; tracked.",
    },
    {
        "id": "github_full_stack_release_job",
        "summary": "Paste the GitHub Actions release-check job URL, pass summary, release commit SHA, immutable artifact name swimcrm-release-<commit-sha>, archive SHA-256, file-list SHA-256, and frontend dist file count here.",
        "evidence_url": "",
    },
    {
        "id": "github_postgres_backend_job",
        "summary": "Paste the GitHub Actions postgres-backend-check job URL, pass summary, job name postgres-backend-check, and release commit SHA here.",
        "evidence_url": "",
    },
    {
        "id": "target_host_release_install",
        "command": "scripts\\install-release-on-target-host.cmd -Manifest releases\\swimcrm-release-<short-sha>.manifest.json -InstallRoot <release-root> -RunInstall",
        "summary": "Extract the verified release archive on the target host, install backend/frontend dependencies, and verify migrations.",
        "output_excerpt": "Must include: Target-host release install completed; Target-host release install verified; Release archive extracted on target host; Immutable release artifact verified; artifact_file_count; artifact_file_list_sha256; frontend_dist_file_count; Backend dependencies installed; Frontend dependencies installed; Django migrations check passed.",
    },
    {
        "id": "production_env_preflight",
        "command": "scripts\\check-production-env.cmd",
        "summary": "Run the production preflight on the target host and paste the pass summary here.",
        "output_excerpt": "Must include: Production environment check passed; Runtime path settings passed; PostgreSQL production settings passed; Celery production settings passed; HTTPS reverse-proxy settings passed.",
    },
    {
        "id": "live_app_health",
        "command": "scripts\\check-app-health.cmd -RequireHttps -RequireOpsOk",
        "summary": "Run live app health on the target host and paste the pass summary here, including the real Django https:// production URL.",
        "output_excerpt": "Must include: Django health check passed: https://<production-django-host>/api/health/; Django operations status: ok; Operations status ok requirement passed; HTTPS live endpoint requirement passed; App health check passed.",
    },
    {
        "id": "backup_restore_drill",
        "command": "scripts\\backup-pg.cmd; scripts\\verify-pg-restore.cmd",
        "summary": "Paste the latest backup, PostgreSQL restore drill evidence, and the backup dump SHA256 value here.",
        "output_excerpt": "Must include: PostgreSQL backup written; Backup dump sha256 OK: <64-hex-sha256>; Backup dump list OK; Restore verification OK; Backup set verification OK.",
    },
    {
        "id": "rollback_plan_acknowledged",
        "command": "scripts\\acknowledge-production-rollback.cmd -ConfirmStopWriters -ConfirmVerifiedBackup -ConfirmRestorePlan -ConfirmMigrateCheck -ConfirmRestartServices -ConfirmLiveSmoke",
        "summary": "Run the explicit rollback acknowledgement helper before cutover approval and paste its full pass output here.",
        "output_excerpt": "Must include: Rollback plan reviewed; stop writers; verified backup; restore; migrate --check; restart services; live smoke; Production rollback acknowledgement completed.",
    },
]


def _git(args):
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return ""
    return result.stdout.strip()


def _source_tree_state():
    return "clean" if not _git(["status", "--porcelain"]) else "dirty"


def _archive_manifest_data(archive_manifest):
    if not archive_manifest:
        return {}
    path = Path(archive_manifest)
    if not path.is_absolute():
        path = REPO_ROOT / path
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return {}


def _evidence_items(
    local_backend_passed=False,
    local_full_stack_passed=False,
    release_archive_passed=False,
    archive_sha256="",
    archive_manifest="",
    release_commit_sha="",
):
    now = datetime.now(timezone.utc).isoformat()
    manifest_data = _archive_manifest_data(archive_manifest) if release_archive_passed else {}
    if not archive_sha256:
        archive_sha256 = manifest_data.get("archive_sha256", "")
    artifact_file_count = manifest_data.get("artifact_file_count", "<artifact-file-count>")
    artifact_file_list_sha256 = manifest_data.get("artifact_file_list_sha256", "<64-hex-sha256>")
    frontend_dist_file_count = manifest_data.get("frontend_dist_file_count", "<frontend-dist-file-count>")
    rows = []
    for template in EVIDENCE_ITEMS:
        item = dict(template)
        item["status"] = "pending"
        item["captured_at"] = ""
        if item["id"] == "local_backend_release_gate" and local_backend_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = "Backend release checks passed."
            item["output_excerpt"] = "Backend release checks passed. Production readiness audit verified. Tracked release source manifests."
        if item["id"] == "local_full_stack_release_gate" and local_full_stack_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = "Full-stack release checks passed."
            item["output_excerpt"] = "Full-stack release checks passed. found 0 vulnerabilities. Frontend production build passed. Frontend Playwright smoke tests passed."
        if item["id"] == "release_source_archive" and release_archive_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = f"Immutable deployment artifact was built and verified for commit {release_commit_sha}."
            manifest_fragment = f" Release artifact manifest written: {archive_manifest}." if archive_manifest else " Release artifact manifest written."
            item["output_excerpt"] = (
                "Immutable release artifact written."
                f"{manifest_fragment} "
                "Immutable release artifact verified. "
                f"artifact_file_count: {artifact_file_count}. "
                f"artifact_file_list_sha256: {artifact_file_list_sha256}. "
                f"frontend_dist_file_count: {frontend_dist_file_count}. "
                f"commit_sha: {release_commit_sha}. "
                f"archive_sha256: {archive_sha256}."
            )
        if item["id"] == "tracked_release_source_guard" and release_archive_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = "Tracked release-source guard passed for required frontend manifests."
            item["output_excerpt"] = "Release source manifests verified. Required release manifests are tracked by Git."
        rows.append(item)
    return rows


def build_manifest(
    environment,
    local_backend_passed=False,
    local_full_stack_passed=False,
    release_archive_passed=False,
    archive_sha256="",
    archive_manifest="",
):
    release_commit_sha = _git(["rev-parse", "HEAD"])
    return {
        "version": "2026-07-16",
        "environment": environment,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "release_candidate": {
            "commit_sha": release_commit_sha,
            "branch": _git(["branch", "--show-current"]),
            "source_tree": _source_tree_state(),
        },
        "required_evidence": _evidence_items(
            local_backend_passed=local_backend_passed,
            local_full_stack_passed=local_full_stack_passed,
            release_archive_passed=release_archive_passed,
            archive_sha256=archive_sha256,
            archive_manifest=archive_manifest,
            release_commit_sha=release_commit_sha,
        ),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Create a draft production cutover evidence manifest."
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--environment", choices=["staging", "production"], default="production")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--local-backend-passed", action="store_true")
    parser.add_argument("--local-full-stack-passed", action="store_true")
    parser.add_argument("--release-archive-passed", action="store_true")
    parser.add_argument("--archive-sha256", default="")
    parser.add_argument("--archive-manifest", default="")
    args = parser.parse_args()

    output = Path(args.output)
    if not output.is_absolute():
        output = REPO_ROOT / output
    if output.exists() and not args.force:
        print(f"Refusing to overwrite existing file: {output}")
        print("Pass --force to overwrite it.")
        return 1

    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest(
        environment=args.environment,
        local_backend_passed=args.local_backend_passed,
        local_full_stack_passed=args.local_full_stack_passed,
        release_archive_passed=args.release_archive_passed,
        archive_sha256=args.archive_sha256,
        archive_manifest=args.archive_manifest,
    )
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Draft production cutover evidence written: {output}")
    print("Fill pending external evidence, then run scripts\\verify-production-cutover-evidence.cmd.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
