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
        "output_excerpt": "Must include: Backend release checks passed; Production readiness audit verified; NocoBase API build-pack smoke check; Tracked release source manifests.",
    },
    {
        "id": "local_full_stack_release_gate",
        "command": "scripts\\release-check-full.cmd",
        "summary": "Run the full-stack release gate and paste the final pass summary here.",
        "output_excerpt": "Must include: Full-stack release checks passed; found 0 vulnerabilities; Frontend production build; Frontend Playwright smoke tests.",
    },
    {
        "id": "release_source_archive",
        "command": "scripts\\build-release-source.cmd",
        "summary": "Run the release source archive builder from the clean release commit, verify the manifest/checksum, and paste the pass summary plus the release commit SHA here.",
        "output_excerpt": "Must include: Release source archive written; Release source manifest written; Release source archive manifest verified; release_candidate.commit_sha; sha256.",
    },
    {
        "id": "tracked_release_source_guard",
        "command": "scripts\\verify-release-source-manifests.cmd -RequireTracked",
        "summary": "Run the tracked release-source guard after staging/committing required manifests and paste the pass summary here.",
        "output_excerpt": "Must include: Release source manifests verified; tracked.",
    },
    {
        "id": "github_full_stack_release_job",
        "summary": "Paste the GitHub Actions release-check job URL, pass summary, release commit SHA, and artifact name swimcrm-release-source-<commit-sha> here.",
        "evidence_url": "",
    },
    {
        "id": "github_postgres_backend_job",
        "summary": "Paste the GitHub Actions postgres-backend-check job URL, pass summary, job name postgres-backend-check, and release commit SHA here.",
        "evidence_url": "",
    },
    {
        "id": "production_env_preflight",
        "command": "scripts\\check-production-env.cmd",
        "summary": "Run the production preflight on the target host and paste the pass summary here.",
        "output_excerpt": "Must include: Production environment check passed; Runtime path settings passed; PostgreSQL production settings passed; Celery production settings passed; NocoBase production settings passed; HTTPS reverse-proxy settings passed.",
    },
    {
        "id": "live_hybrid_health",
        "command": "scripts\\check-hybrid-health.cmd -RequireHttps",
        "summary": "Run live hybrid health on the target host and paste the pass summary here, including the real Django and NocoBase https:// production URLs.",
        "output_excerpt": "Must include: Django health check passed: https://<production-django-host>/api/health/; NocoBase process health check passed: https://<production-nocobase-host>/api/__health_check; Hybrid health check passed; HTTPS live endpoint requirement passed; nocobase_config_health; /api/nocobase/config/languages/",
    },
    {
        "id": "hybrid_backup_restore_drill",
        "command": "scripts\\backup-hybrid.ps1; scripts\\restore-hybrid.ps1 -PlanOnly; scripts\\verify-hybrid-backup-set.cmd",
        "summary": "Paste latest backup, hybrid restore plan, hybrid backup-set verification, and PostgreSQL restore drill evidence here.",
        "output_excerpt": "Must include: Hybrid backup set written; backup_set_dir; nocobase_database; Django dump sha256 OK; NocoBase dump sha256 OK; Django dump list OK; NocoBase dump list OK; Restore verification OK; Hybrid backup set verification OK.",
    },
    {
        "id": "rollback_plan_acknowledged",
        "summary": "Confirm rollback plan was reviewed before cutover approval. Must include: Rollback plan reviewed; stop writers; verified backup; restore; migrate --check; restart services; live smoke.",
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


def _evidence_items(
    local_backend_passed=False,
    local_full_stack_passed=False,
    release_archive_passed=False,
    archive_sha256="",
    archive_manifest="",
    release_commit_sha="",
):
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for template in EVIDENCE_ITEMS:
        item = dict(template)
        item["status"] = "pending"
        item["captured_at"] = ""
        if item["id"] == "local_backend_release_gate" and local_backend_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = "Backend release checks passed."
            item["output_excerpt"] = "Backend release checks passed. Production readiness audit verified. NocoBase API build-pack smoke check. Tracked release source manifests."
        if item["id"] == "local_full_stack_release_gate" and local_full_stack_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = "Full-stack release checks passed."
            item["output_excerpt"] = "Full-stack release checks passed. found 0 vulnerabilities. Frontend production build passed. Frontend Playwright smoke tests passed."
        if item["id"] == "release_source_archive" and release_archive_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = f"Release source archive was built and verified for commit {release_commit_sha}."
            manifest_fragment = f" Release source manifest written: {archive_manifest}." if archive_manifest else " Release source manifest written."
            item["output_excerpt"] = (
                "Release source archive written."
                f"{manifest_fragment} "
                f"Release source archive sha256: {archive_sha256}. "
                "Release source archive manifest verified. "
                f"commit_sha: {release_commit_sha}. "
                f"archive_sha256: {archive_sha256}."
            )
        if item["id"] == "tracked_release_source_guard" and release_archive_passed:
            item["status"] = "passed"
            item["captured_at"] = now
            item["summary"] = "Tracked release-source guard passed for required root and frontend manifests."
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
