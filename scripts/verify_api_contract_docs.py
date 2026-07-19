import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "swimcrm"
DOC_PATH = REPO_ROOT / "docs" / "API_CONTRACT.md"


def _load_contract():
    sys.path.insert(0, str(BACKEND_DIR))
    from portal.contract import API_CONTRACT  # noqa: PLC0415

    return API_CONTRACT


def _contract_paths(contract):
    paths = set()
    for endpoint in contract.get("endpoints", []):
        path = endpoint.get("path", "")
        if path.startswith("/api/nocobase/"):
            paths.add(path)
    return sorted(paths)


def validate():
    errors = []
    if not DOC_PATH.exists():
        return [f"API contract documentation does not exist: {DOC_PATH}"]

    contract = _load_contract()
    text = DOC_PATH.read_text(encoding="utf-8")
    version = contract.get("version")
    if not version:
        errors.append("API_CONTRACT.version is required")
    elif not re.search(rf"Last updated:\s*{re.escape(version)}\b", text):
        errors.append(
            f"docs/API_CONTRACT.md Last updated must match API_CONTRACT.version {version}"
        )

    required_companions = [
        "GET /api/admin/api-contract/",
        "swimcrm/portal/contract.py",
        "swimcrm/portal/nocobase_contract.py",
    ]
    for companion in required_companions:
        if companion not in text:
            errors.append(f"docs/API_CONTRACT.md missing companion reference: {companion}")

    for path in _contract_paths(contract):
        if path not in text:
            errors.append(f"docs/API_CONTRACT.md missing NocoBase endpoint path: {path}")

    required_nocobase_query_docs = [
        "`limit` must be an integer from `1` to `500`",
        "Invalid NocoBase query parameters return JSON `400` errors",
        "`template_id`",
        "`scheme_id`",
        "`trainer_id`",
        "Invalid config filters return JSON `400` errors",
    ]
    for snippet in required_nocobase_query_docs:
        if snippet not in text:
            errors.append(f"docs/API_CONTRACT.md missing NocoBase query validation doc: {snippet}")

    return errors


def main():
    errors = validate()
    if errors:
        print("API contract documentation verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("API contract documentation verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
