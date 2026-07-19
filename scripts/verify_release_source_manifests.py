import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_RELEASE_FILES = (
    "package.json",
    "package-lock.json",
    "frontend/package.json",
    "frontend/package-lock.json",
)


def _git(repo_root, args):
    return subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=False,
        capture_output=True,
        text=True,
    )


def _is_git_work_tree(repo_root):
    result = _git(repo_root, ["rev-parse", "--is-inside-work-tree"])
    return result.returncode == 0 and result.stdout.strip() == "true"


def _is_tracked(repo_root, rel_path):
    result = _git(repo_root, ["-c", "core.quotepath=false", "ls-files", "--", rel_path])
    return bool(result.stdout.strip())


def validate(repo_root=REPO_ROOT, require_tracked=False):
    repo_root = Path(repo_root)
    errors = []
    if require_tracked and not _is_git_work_tree(repo_root):
        return ["--require-tracked requires a git work tree"]

    for rel_path in REQUIRED_RELEASE_FILES:
        path = repo_root / rel_path
        if not path.is_file():
            errors.append(f"{rel_path}: missing required release manifest")
            continue
        if require_tracked and not _is_tracked(repo_root, rel_path):
            errors.append(f"{rel_path}: required release manifest is not tracked by git")

    return errors


def main():
    parser = argparse.ArgumentParser(
        description="Verify release-source package manifests required for NocoBase hybrid builds."
    )
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--require-tracked", action="store_true")
    args = parser.parse_args()

    errors = validate(args.repo_root, require_tracked=args.require_tracked)
    if errors:
        print("Release source manifest verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Release source manifests verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
