import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "swimcrm"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from common.nocobase_blueprint import validate_nocobase_blueprint


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: verify_nocobase_blueprint.py <blueprint.json>", file=sys.stderr)
        return 2

    result = validate_nocobase_blueprint(sys.argv[1])
    if not result["ok"]:
        print(json.dumps(result, indent=2), file=sys.stderr)
        return 1

    print(f"NocoBase first-screens blueprint verified: {result['screens_count']} screens.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
