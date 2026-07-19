import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release-check.yml"


def _require(text, pattern, label, errors):
    if not re.search(pattern, text, flags=re.MULTILINE):
        errors.append(f"missing {label}: {pattern}")


def _require_order(text, first, second, label, errors):
    first_index = text.find(first)
    second_index = text.find(second)
    if first_index == -1 or second_index == -1 or first_index >= second_index:
        errors.append(f"invalid order for {label}: expected {first!r} before {second!r}")


def _job_block(text, job_name):
    pattern = re.compile(
        rf"(?ms)^  {re.escape(job_name)}:\n(?P<body>.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)"
    )
    match = pattern.search(text)
    return match.group("body") if match else ""


def validate(path=WORKFLOW):
    errors = []
    if not path.exists():
        return [f"workflow file does not exist: {path}"]

    text = path.read_text(encoding="utf-8-sig")
    _require(text, r"^name:\s+Release check\s*$", "workflow name", errors)
    _require(text, r"(?m)^  push:\s*$", "push trigger", errors)
    _require(text, r"(?m)^  pull_request:\s*$", "pull_request trigger", errors)
    _require(text, r"(?m)^  workflow_dispatch:\s*$", "workflow_dispatch trigger", errors)

    release = _job_block(text, "release-check")
    if not release:
        errors.append("missing release-check job")
    else:
        _require(release, r"runs-on:\s+windows-latest", "Windows release runner", errors)
        _require(release, r"actions/checkout@v4", "checkout step", errors)
        _require(release, r"actions/setup-python@v5", "Python setup step", errors)
        _require(release, r"python-version:\s+\"3\.12\"", "Python 3.12", errors)
        _require(release, r"actions/setup-node@v4", "Node setup step", errors)
        _require(release, r"node-version:\s+\"22\"", "Node 22", errors)
        _require(
            release,
            r"python scripts/verify_release_source_manifests\.py --require-tracked",
            "tracked release source manifest check",
            errors,
        )
        _require(
            release,
            r"build-release-source\.ps1",
            "release source archive builder",
            errors,
        )
        _require(
            release,
            r"verify-release-source-archive\.ps1",
            "release source archive verifier",
            errors,
        )
        _require(
            release,
            r"git rev-parse --short=12 HEAD",
            "release source archive verifier short SHA",
            errors,
        )
        _require_order(
            release,
            "actions/setup-python@v5",
            "python scripts/verify_release_source_manifests.py --require-tracked",
            "Python setup before tracked manifest check",
            errors,
        )
        _require_order(
            release,
            "python scripts/verify_release_source_manifests.py --require-tracked",
            "build-release-source.ps1",
            "tracked manifest check before release source archive",
            errors,
        )
        _require_order(
            release,
            "build-release-source.ps1",
            "verify-release-source-archive.ps1",
            "release source archive before archive verifier",
            errors,
        )
        _require_order(
            release,
            "verify-release-source-archive.ps1",
            "actions/setup-node@v4",
            "verified release source archive before generated Node artifacts",
            errors,
        )
        _require(release, r"verify-release-tree\.ps1 -Strict", "strict release tree check", errors)
        _require(release, r"npm ci --cache \.npm-cache", "root Node install", errors)
        _require(release, r"pip install -r swimcrm\\requirements\.txt", "backend dependency install", errors)
        _require(
            release,
            r"release-check-full\.ps1 -AllowMissingLocalNocoBaseRuntime",
            "full-stack release gate",
            errors,
        )

    postgres = _job_block(text, "postgres-backend-check")
    if not postgres:
        errors.append("missing postgres-backend-check job")
    else:
        _require(postgres, r"runs-on:\s+ubuntu-latest", "Ubuntu PostgreSQL runner", errors)
        _require(postgres, r"actions/checkout@v4", "PostgreSQL checkout step", errors)
        _require(postgres, r"actions/setup-python@v5", "PostgreSQL Python setup step", errors)
        _require(postgres, r"python-version:\s+\"3\.12\"", "PostgreSQL Python 3.12", errors)
        _require(
            postgres,
            r"python scripts/verify_release_source_manifests\.py --require-tracked",
            "PostgreSQL tracked release source manifest check",
            errors,
        )
        _require_order(
            postgres,
            "actions/setup-python@v5",
            "python scripts/verify_release_source_manifests.py --require-tracked",
            "PostgreSQL Python setup before tracked manifest check",
            errors,
        )
        _require(postgres, r"image:\s+postgres:16", "PostgreSQL 16 service", errors)
        _require(postgres, r"POSTGRES_DB:\s+swimcrm", "PostgreSQL database env", errors)
        _require(postgres, r"POSTGRES_USER:\s+postgres", "PostgreSQL user env", errors)
        _require(postgres, r"POSTGRES_PASSWORD:\s+postgres", "PostgreSQL password env", errors)
        _require(postgres, r"5432:5432", "PostgreSQL service port", errors)
        _require(postgres, r"pg_isready -U postgres -d swimcrm", "PostgreSQL health check", errors)
        _require(postgres, r"POSTGRES_HOST:\s+127\.0\.0\.1", "Django PostgreSQL host env", errors)
        _require(postgres, r"POSTGRES_PORT:\s+\"5432\"", "Django PostgreSQL port env", errors)
        _require(postgres, r"PYTHONIOENCODING:\s+utf-8", "UTF-8 test output env", errors)
        _require(postgres, r"python -m venv swimcrm/\.venv", "Linux venv creation", errors)
        _require(
            postgres,
            r"swimcrm/\.venv/bin/python -m pip install -r swimcrm/requirements\.txt",
            "Linux backend dependency install",
            errors,
        )
        _require(postgres, r"working-directory:\s+swimcrm", "Django working directory", errors)
        _require(
            postgres,
            r"\.venv/bin/python manage\.py test tests --noinput",
            "PostgreSQL backend tests command",
            errors,
        )

    return errors


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else WORKFLOW
    errors = validate(path)
    if errors:
        print("CI release workflow verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("CI release workflow verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
