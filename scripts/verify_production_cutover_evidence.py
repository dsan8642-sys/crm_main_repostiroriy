import json
import re
import sys
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVIDENCE = REPO_ROOT / "docs" / "PRODUCTION_CUTOVER_EVIDENCE.json"
PLACEHOLDER_PATTERN = re.compile(
    r"(<[^>]+>|TODO|TBD|example|0123456789abcdef)",
    re.IGNORECASE,
)
GITHUB_ACTIONS_RUN_PATTERN = re.compile(
    r"^https://github\.com/[^/\s]+/[^/\s]+/actions/runs/\d+(?:[/?#].*)?$",
    re.IGNORECASE,
)

REQUIRED_EVIDENCE_IDS = {
    "local_backend_release_gate",
    "local_full_stack_release_gate",
    "release_source_archive",
    "tracked_release_source_guard",
    "github_full_stack_release_job",
    "github_postgres_backend_job",
    "production_env_preflight",
    "live_hybrid_health",
    "hybrid_backup_restore_drill",
    "rollback_plan_acknowledged",
}

EXTERNAL_EVIDENCE_IDS = {
    "github_full_stack_release_job",
    "github_postgres_backend_job",
}

EXPECTED_COMMANDS = {
    "local_backend_release_gate": "scripts\\release-check-backend.cmd",
    "local_full_stack_release_gate": "scripts\\release-check-full.cmd",
    "release_source_archive": "scripts\\build-release-source.cmd",
    "tracked_release_source_guard": "scripts\\verify-release-source-manifests.cmd -RequireTracked",
    "production_env_preflight": "scripts\\check-production-env.cmd",
    "live_hybrid_health": "scripts\\check-hybrid-health.cmd",
    "hybrid_backup_restore_drill": "scripts\\backup-hybrid.ps1; scripts\\restore-hybrid.ps1 -PlanOnly; scripts\\verify-hybrid-backup-set.cmd",
}

REQUIRED_OUTPUT_FRAGMENTS = {
    "local_backend_release_gate": [
        "Backend release checks passed",
        "Production readiness audit verified",
        "NocoBase API build-pack smoke check",
        "Tracked release source manifests",
    ],
    "local_full_stack_release_gate": [
        "Full-stack release checks passed",
        "found 0 vulnerabilities",
        "Frontend production build",
        "Frontend Playwright smoke tests",
    ],
    "release_source_archive": [
        "Release source archive written",
        "Release source manifest written",
        "Release source archive manifest verified",
        "sha256",
    ],
    "tracked_release_source_guard": [
        "Release source manifests verified",
        "tracked",
    ],
    "github_full_stack_release_job": [
        "swimcrm-release-source-",
    ],
    "production_env_preflight": [
        "Production environment check passed",
        "Runtime path settings passed",
        "PostgreSQL production settings passed",
        "Celery production settings passed",
        "NocoBase production settings passed",
        "HTTPS reverse-proxy settings passed",
    ],
    "live_hybrid_health": [
        "Hybrid health check passed",
        "nocobase_config_health",
        "/api/nocobase/config/languages/",
    ],
    "hybrid_backup_restore_drill": [
        "Hybrid backup set written",
        "backup_set_dir",
        "nocobase_database",
        "Django dump sha256 OK",
        "NocoBase dump sha256 OK",
        "Django dump list OK",
        "NocoBase dump list OK",
        "Restore verification OK",
        "Hybrid backup set verification OK",
    ],
    "rollback_plan_acknowledged": [
        "Rollback plan reviewed",
        "restore",
        "restart services",
    ],
}


def _load_json(path):
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def _has_placeholder(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(PLACEHOLDER_PATTERN.search(value))
    if isinstance(value, dict):
        return any(_has_placeholder(item) for item in value.values())
    if isinstance(value, list):
        return any(_has_placeholder(item) for item in value)
    return False


def _validate_release_candidate(candidate, errors, expected_commit_sha=""):
    if not isinstance(candidate, dict):
        errors.append("release_candidate must be an object")
        return
    commit_sha = candidate.get("commit_sha", "")
    if not re.fullmatch(r"[0-9a-f]{40}", commit_sha):
        errors.append("release_candidate.commit_sha must be a 40-character git SHA")
    elif expected_commit_sha and commit_sha != expected_commit_sha:
        errors.append(
            "release_candidate.commit_sha must match current HEAD "
            f"({expected_commit_sha})"
        )
    if candidate.get("source_tree") != "clean":
        errors.append("release_candidate.source_tree must be 'clean'")
    if not candidate.get("branch"):
        errors.append("release_candidate.branch is required")


def _validate_timestamp(value, field_name, errors):
    if not value:
        errors.append(f"{field_name} is required")
        return
    if not isinstance(value, str):
        errors.append(f"{field_name} must be an ISO-8601 string")
        return
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{field_name} must be a valid ISO-8601 timestamp")


def _combined_item_text(item):
    return " ".join(
        str(item.get(field, ""))
        for field in ("summary", "output_excerpt", "evidence_url")
    )


def _validate_item(item, errors, release_commit_sha="", expected_archive_sha256=""):
    evidence_id = item.get("id", "")
    if evidence_id not in REQUIRED_EVIDENCE_IDS:
        errors.append(f"unexpected evidence id: {evidence_id or '<missing>'}")
        return
    if item.get("status") != "passed":
        errors.append(f"{evidence_id}: status must be 'passed'")
    _validate_timestamp(item.get("captured_at"), f"{evidence_id}: captured_at", errors)
    if not item.get("summary"):
        errors.append(f"{evidence_id}: summary is required")
    if evidence_id in EXTERNAL_EVIDENCE_IDS:
        url = item.get("evidence_url", "")
        if not GITHUB_ACTIONS_RUN_PATTERN.match(url):
            errors.append(f"{evidence_id}: evidence_url must be a GitHub Actions run URL")
        if release_commit_sha and release_commit_sha not in _combined_item_text(item):
            errors.append(f"{evidence_id}: evidence must mention release_candidate.commit_sha")
    elif evidence_id == "release_source_archive":
        combined = _combined_item_text(item)
        if release_commit_sha and release_commit_sha not in combined:
            errors.append(f"{evidence_id}: evidence must mention release_candidate.commit_sha")
        if not re.search(r"sha256[:=\s]+[0-9a-f]{64}\b", combined, flags=re.IGNORECASE):
            errors.append(f"{evidence_id}: evidence must include archive sha256")
        if expected_archive_sha256 and expected_archive_sha256 not in combined.lower():
            errors.append(
                f"{evidence_id}: evidence must include current release archive sha256 "
                f"({expected_archive_sha256})"
            )
    elif evidence_id != "rollback_plan_acknowledged" and not item.get("command"):
        errors.append(f"{evidence_id}: command is required")

    expected_command = EXPECTED_COMMANDS.get(evidence_id)
    if expected_command and item.get("command") != expected_command:
        errors.append(f"{evidence_id}: command must be {expected_command!r}")

    combined = _combined_item_text(item)
    for fragment in REQUIRED_OUTPUT_FRAGMENTS.get(evidence_id, []):
        if fragment not in combined:
            errors.append(f"{evidence_id}: missing evidence fragment: {fragment}")


def validate(
    path=DEFAULT_EVIDENCE,
    allow_example=False,
    allow_staging=False,
    expected_commit_sha="",
    expected_archive_sha256="",
):
    errors = []
    if not path.exists():
        return [f"production cutover evidence file does not exist: {path}"]

    data = _load_json(path)
    if _has_placeholder(data) and not allow_example:
        errors.append("evidence contains placeholders; copy the example and replace sample values")

    if not data.get("version"):
        errors.append("version is required")
    allowed_environments = {"production"}
    if allow_staging:
        allowed_environments.add("staging")
    if data.get("environment") not in allowed_environments:
        if allow_staging:
            errors.append("environment must be 'production' or 'staging'")
        else:
            errors.append("environment must be 'production' for cutover approval; use --allow-staging only for rehearsal manifests")
    _validate_timestamp(data.get("generated_at"), "generated_at", errors)
    release_candidate = data.get("release_candidate")
    _validate_release_candidate(release_candidate, errors, expected_commit_sha=expected_commit_sha)
    release_commit_sha = release_candidate.get("commit_sha", "") if isinstance(release_candidate, dict) else ""

    items = data.get("required_evidence") or []
    if not isinstance(items, list):
        errors.append("required_evidence must be a list")
        items = []

    seen = set()
    for item in items:
        if not isinstance(item, dict):
            errors.append("each required_evidence item must be an object")
            continue
        evidence_id = item.get("id")
        if evidence_id in seen:
            errors.append(f"duplicate evidence id: {evidence_id}")
        seen.add(evidence_id)
        _validate_item(
            item,
            errors,
            release_commit_sha=release_commit_sha,
            expected_archive_sha256=expected_archive_sha256,
        )

    missing = sorted(REQUIRED_EVIDENCE_IDS - seen)
    for evidence_id in missing:
        errors.append(f"missing required evidence id: {evidence_id}")

    return errors


def main():
    args = sys.argv[1:]
    allow_example = False
    allow_staging = False
    expected_commit_sha = ""
    expected_archive_sha256 = ""
    if "--allow-example" in args:
        allow_example = True
        args.remove("--allow-example")
    if "--allow-staging" in args:
        allow_staging = True
        args.remove("--allow-staging")
    if "--expected-commit-sha" in args:
        index = args.index("--expected-commit-sha")
        try:
            expected_commit_sha = args[index + 1]
        except IndexError:
            print("--expected-commit-sha requires a value", file=sys.stderr)
            return 2
        del args[index:index + 2]
        if not re.fullmatch(r"[0-9a-f]{40}", expected_commit_sha):
            print("--expected-commit-sha must be a 40-character lowercase git SHA", file=sys.stderr)
            return 2
    if "--expected-archive-sha256" in args:
        index = args.index("--expected-archive-sha256")
        try:
            expected_archive_sha256 = args[index + 1].lower()
        except IndexError:
            print("--expected-archive-sha256 requires a value", file=sys.stderr)
            return 2
        del args[index:index + 2]
        if not re.fullmatch(r"[0-9a-f]{64}", expected_archive_sha256):
            print("--expected-archive-sha256 must be a 64-character lowercase SHA256", file=sys.stderr)
            return 2
    path = Path(args[0]) if args else DEFAULT_EVIDENCE
    errors = validate(
        path,
        allow_example=allow_example,
        allow_staging=allow_staging,
        expected_commit_sha=expected_commit_sha,
        expected_archive_sha256=expected_archive_sha256,
    )
    if errors:
        print("Production cutover evidence verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Production cutover evidence verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
