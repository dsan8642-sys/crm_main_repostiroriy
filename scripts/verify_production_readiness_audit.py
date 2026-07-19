import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT = REPO_ROOT / "docs" / "PRODUCTION_READINESS_AUDIT.json"


def _load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _as_repo_path(value):
    path = REPO_ROOT / value
    try:
        path.resolve().relative_to(REPO_ROOT.resolve())
    except ValueError:
        raise ValueError(f"path escapes repository root: {value}")
    return path


def _file_text(path):
    return path.read_text(encoding="utf-8")


def _check_patterns(text, patterns):
    missing = []
    for pattern in patterns:
        if not re.search(pattern, text, flags=re.MULTILINE):
            missing.append(pattern)
    return missing


def _check_absent_patterns(text, patterns):
    present = []
    for pattern in patterns:
        if re.search(pattern, text, flags=re.MULTILINE):
            present.append(pattern)
    return present


def _check_evidence(requirement_id, evidence):
    errors = []
    evidence_type = evidence.get("type")
    rel_path = evidence.get("path")
    if evidence_type not in {"file_exists", "file_contains", "file_not_contains", "test_contains", "command_exists"}:
        return [f"{requirement_id}: unsupported evidence type {evidence_type!r}"]
    if not rel_path:
        return [f"{requirement_id}: evidence path is required"]

    try:
        path = _as_repo_path(rel_path)
    except ValueError as exc:
        return [f"{requirement_id}: {exc}"]

    if not path.exists():
        return [f"{requirement_id}: evidence path does not exist: {rel_path}"]

    if evidence_type in {"file_contains", "test_contains"}:
        patterns = evidence.get("patterns") or []
        if not patterns:
            errors.append(f"{requirement_id}: {evidence_type} requires non-empty patterns for {rel_path}")
        else:
            missing = _check_patterns(_file_text(path), patterns)
            for pattern in missing:
                errors.append(f"{requirement_id}: pattern not found in {rel_path}: {pattern}")

    if evidence_type == "file_not_contains":
        patterns = evidence.get("patterns") or []
        if not patterns:
            errors.append(f"{requirement_id}: file_not_contains requires non-empty patterns for {rel_path}")
        else:
            present = _check_absent_patterns(_file_text(path), patterns)
            for pattern in present:
                errors.append(f"{requirement_id}: forbidden pattern found in {rel_path}: {pattern}")

    if evidence_type == "test_contains" and "tests" not in rel_path.replace("\\", "/"):
        errors.append(f"{requirement_id}: test_contains must point at a test file: {rel_path}")

    if evidence_type == "command_exists" and path.suffix.lower() not in {".cmd", ".ps1"}:
        errors.append(f"{requirement_id}: command_exists must point at a .cmd or .ps1 wrapper: {rel_path}")

    return errors


def validate(path=DEFAULT_AUDIT):
    audit = _load_json(path)
    errors = []
    requirements = audit.get("requirements") or []
    rules = audit.get("rules") or {}
    minimum = int(rules.get("minimum_requirements") or 1)

    if len(requirements) < minimum:
        errors.append(f"expected at least {minimum} requirements, found {len(requirements)}")

    seen_ids = set()
    categories = set()
    for requirement in requirements:
        req_id = requirement.get("id")
        category = requirement.get("category")
        if not req_id:
            errors.append("requirement id is required")
            continue
        if req_id in seen_ids:
            errors.append(f"duplicate requirement id: {req_id}")
        seen_ids.add(req_id)

        if not category:
            errors.append(f"{req_id}: category is required")
        else:
            categories.add(category)

        if not requirement.get("statement"):
            errors.append(f"{req_id}: statement is required")

        evidence_items = requirement.get("evidence") or []
        if not evidence_items:
            errors.append(f"{req_id}: at least one evidence item is required")
        for evidence in evidence_items:
            errors.extend(_check_evidence(req_id, evidence))

    for category in rules.get("required_categories") or []:
        if category not in categories:
            errors.append(f"required category has no requirement: {category}")

    return {
        "ok": not errors,
        "path": str(path),
        "requirements_count": len(requirements),
        "categories_count": len(categories),
        "errors": errors,
    }


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_AUDIT
    result = validate(path)
    if not result["ok"]:
        print(json.dumps(result, indent=2), file=sys.stderr)
        return 1
    print(
        "Production readiness audit verified: "
        f"{result['requirements_count']} requirements across {result['categories_count']} categories."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
