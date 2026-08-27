import os
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "swimcrm"
DOC_PATH = REPO_ROOT / "docs" / "API_CONTRACT.md"


def _load_contract():
    sys.path.insert(0, str(BACKEND_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django  # noqa: PLC0415
    django.setup()
    from portal.openapi import build_openapi_schema  # noqa: PLC0415

    return build_openapi_schema()


def _contract_paths(contract):
    return sorted(
        path for path in contract.get("paths", {})
        if path.startswith("/api/admin/settings/")
    )


def validate():
    errors = []
    if not DOC_PATH.exists():
        return [f"API contract documentation does not exist: {DOC_PATH}"]

    contract = _load_contract()
    text = DOC_PATH.read_text(encoding="utf-8")
    version = contract.get("info", {}).get("version")
    if not version:
        errors.append("OpenAPI info.version is required")
    elif not re.search(rf"Last updated:\s*{re.escape(version)}\b", text):
        errors.append(
            f"docs/API_CONTRACT.md Last updated must match OpenAPI version {version}"
        )

    required_companions = [
        "GET /api/admin/api-contract/",
        "GET /api/openapi.json",
        "swimcrm/portal/openapi.py",
        "swimcrm/portal/admin_settings_views.py",
    ]
    for companion in required_companions:
        if companion not in text:
            errors.append(f"docs/API_CONTRACT.md missing companion reference: {companion}")

    for path in _contract_paths(contract):
        documented_path = re.sub(r"\{[^}]+\}", "<id>", path)
        if path not in text and documented_path not in text:
            errors.append(f"docs/API_CONTRACT.md missing admin settings endpoint path: {path}")

    if contract.get("openapi") != "3.1.0":
        errors.append("Canonical contract must use OpenAPI 3.1.0")
    operation_ids = [
        operation.get("operationId")
        for path_item in contract.get("paths", {}).values()
        for method, operation in path_item.items()
        if method in {"get", "post", "put", "patch", "delete"}
    ]
    if not operation_ids or None in operation_ids:
        errors.append("Every OpenAPI operation must have operationId")
    if len(operation_ids) != len(set(operation_ids)):
        errors.append("OpenAPI operationId values must be unique")

    required_settings_query_docs = [
        "`template_id`",
        "`language_code`",
        "Invalid settings filters return JSON `400` errors",
    ]
    for snippet in required_settings_query_docs:
        if snippet not in text:
            errors.append(f"docs/API_CONTRACT.md missing admin settings query validation doc: {snippet}")

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
