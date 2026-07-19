import json
import re
from pathlib import Path

from django.conf import settings
from django.urls import Resolver404, resolve

from portal.contract import API_CONTRACT
from portal.nocobase_contract import NOCOBASE_ENDPOINT_SCHEMAS


def default_blueprint_path():
    return Path(settings.BASE_DIR).parent / "docs" / "NOCOBASE_FIRST_SCREENS.json"


def default_build_pack_path():
    return Path(settings.BASE_DIR).parent / "docs" / "NOCOBASE_SCREEN_BUILD_PACK.json"


def _concrete_route_path(path):
    return re.sub(r"<[^>]+>", "1", path)


def validate_nocobase_blueprint(path=None):
    blueprint_path = Path(path) if path else default_blueprint_path()
    errors = {
        "missing_contract_endpoints": [],
        "unresolved_routes": [],
        "missing_schemas": [],
        "schema_mismatches": [],
        "invalid_schemas": [],
        "duplicate_screen_ids": [],
        "invalid_screens": [],
    }

    if not blueprint_path.exists():
        return {
            "ok": False,
            "path": str(blueprint_path),
            "version": None,
            "screens_count": 0,
            "errors": {"missing_file": str(blueprint_path), **errors},
        }

    blueprint = json.loads(blueprint_path.read_text(encoding="utf-8"))
    contract = {
        (endpoint["method"], endpoint["path"])
        for endpoint in API_CONTRACT["endpoints"]
    }

    for screen in blueprint.get("screens", []):
        for endpoint in screen.get("endpoints", []):
            key = (endpoint["method"], endpoint["path"])
            if key not in contract:
                errors["missing_contract_endpoints"].append({
                    "screen": screen.get("id"),
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                })

    for method, route_path in sorted(contract):
        if not route_path.startswith("/api/nocobase/"):
            continue
        try:
            resolve(_concrete_route_path(route_path))
        except Resolver404:
            errors["unresolved_routes"].append({"method": method, "path": route_path})

    for screen in blueprint.get("screens", []):
        for endpoint in screen.get("endpoints", []):
            key = (endpoint["method"], endpoint["path"])
            schema = NOCOBASE_ENDPOINT_SCHEMAS.get(key)
            if not schema:
                errors["missing_schemas"].append({
                    "screen": screen.get("id"),
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                })
                continue

            if schema.get("mode") != screen.get("mode"):
                errors["schema_mismatches"].append({
                    "screen": screen.get("id"),
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                    "expected_mode": screen.get("mode"),
                    "schema_mode": schema.get("mode"),
                })
            if schema.get("token") != screen.get("token"):
                errors["schema_mismatches"].append({
                    "screen": screen.get("id"),
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                    "expected_token": screen.get("token"),
                    "schema_token": schema.get("token"),
                })

            declared_keys = set(schema.get("top_level_keys", []))
            declared_keys.update(schema.get("item_keys", []))
            declared_keys.update(schema.get("object_keys", []))
            for nested in schema.get("nested_keys", {}).values():
                declared_keys.update(nested)
            forbidden_overlap = sorted(declared_keys.intersection(schema.get("forbidden_keys", [])))
            if forbidden_overlap:
                errors["invalid_schemas"].append({
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                    "forbidden_overlap": forbidden_overlap,
                })
            if not any(schema.get(name) for name in ("top_level_keys", "item_keys", "object_keys")):
                errors["invalid_schemas"].append({
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                    "error": "schema must declare top_level_keys, item_keys, or object_keys",
                })

    screen_ids = [screen.get("id") for screen in blueprint.get("screens", [])]
    duplicate_ids = sorted({screen_id for screen_id in screen_ids if screen_ids.count(screen_id) > 1})
    errors["duplicate_screen_ids"].extend(duplicate_ids)

    for screen in blueprint.get("screens", []):
        mode = screen.get("mode")
        token = screen.get("token")
        screen_id = screen.get("id")
        if mode not in {"read_only", "guarded_config"}:
            errors["invalid_screens"].append({
                "screen": screen_id,
                "error": f"invalid mode: {mode}",
            })
        if mode == "read_only" and token != "NOCOBASE_BRIDGE_TOKEN":
            errors["invalid_screens"].append({
                "screen": screen_id,
                "error": "read-only screens must use NOCOBASE_BRIDGE_TOKEN",
            })
        if mode == "guarded_config" and token != "NOCOBASE_CONFIG_TOKEN":
            errors["invalid_screens"].append({
                "screen": screen_id,
                "error": "config screens must use NOCOBASE_CONFIG_TOKEN",
            })

    ok = not any(errors.values())
    return {
        "ok": ok,
        "path": str(blueprint_path),
        "version": blueprint.get("version"),
        "screens_count": len(screen_ids),
        "errors": errors,
    }


def validate_nocobase_build_pack(path=None, blueprint_path=None):
    build_pack_path = Path(path) if path else default_build_pack_path()
    source_blueprint_path = Path(blueprint_path) if blueprint_path else default_blueprint_path()
    errors = {
        "missing_file": [],
        "screen_mismatches": [],
        "endpoint_mismatches": [],
        "query_mismatches": [],
        "invalid_tokens": [],
        "invalid_blocks": [],
        "invalid_actions": [],
        "duplicate_data_sources": [],
    }

    if not build_pack_path.exists():
        errors["missing_file"].append(str(build_pack_path))
        return {
            "ok": False,
            "path": str(build_pack_path),
            "version": None,
            "screens_count": 0,
            "errors": errors,
        }
    if not source_blueprint_path.exists():
        errors["missing_file"].append(str(source_blueprint_path))
        return {
            "ok": False,
            "path": str(build_pack_path),
            "version": None,
            "screens_count": 0,
            "errors": errors,
        }

    build_pack = json.loads(build_pack_path.read_text(encoding="utf-8"))
    blueprint = json.loads(source_blueprint_path.read_text(encoding="utf-8"))
    blueprint_by_id = {screen.get("id"): screen for screen in blueprint.get("screens", [])}
    pack_by_id = {screen.get("screen_id"): screen for screen in build_pack.get("screens", [])}
    contract_by_endpoint = {
        (endpoint.get("method"), endpoint.get("path")): endpoint
        for endpoint in API_CONTRACT.get("endpoints", [])
    }

    blueprint_ids = set(blueprint_by_id)
    pack_ids = set(pack_by_id)
    if blueprint_ids != pack_ids:
        errors["screen_mismatches"].append({
            "missing_in_build_pack": sorted(blueprint_ids - pack_ids),
            "unknown_in_build_pack": sorted(pack_ids - blueprint_ids),
        })

    allowed_actions = {"create", "update", "delete"}
    allowed_block_types = {
        "detail_drawer",
        "filter_bar",
        "form",
        "json_readonly",
        "key_value",
        "metric_grid",
        "status_card",
        "table",
    }

    for screen_id, pack_screen in pack_by_id.items():
        blueprint_screen = blueprint_by_id.get(screen_id)
        if not blueprint_screen:
            continue

        expected_endpoints = {
            (endpoint.get("method"), endpoint.get("path"), blueprint_screen.get("token"))
            for endpoint in blueprint_screen.get("endpoints", [])
        }
        actual_endpoints = {
            (source.get("method"), source.get("path"), source.get("token"))
            for source in pack_screen.get("data_sources", [])
        }
        if expected_endpoints != actual_endpoints:
            errors["endpoint_mismatches"].append({
                "screen": screen_id,
                "missing_in_build_pack": sorted(
                    [{"method": method, "path": path, "token": token} for method, path, token in expected_endpoints - actual_endpoints],
                    key=lambda item: (item["path"], item["method"], item["token"]),
                ),
                "unknown_in_build_pack": sorted(
                    [{"method": method, "path": path, "token": token} for method, path, token in actual_endpoints - expected_endpoints],
                    key=lambda item: (item["path"], item["method"], item["token"]),
                ),
            })

        source_names = [source.get("name") for source in pack_screen.get("data_sources", [])]
        duplicate_sources = sorted({name for name in source_names if source_names.count(name) > 1})
        if duplicate_sources:
            errors["duplicate_data_sources"].append({
                "screen": screen_id,
                "sources": duplicate_sources,
            })

        for source in pack_screen.get("data_sources", []):
            if source.get("token") != blueprint_screen.get("token"):
                errors["invalid_tokens"].append({
                    "screen": screen_id,
                    "source": source.get("name"),
                    "expected": blueprint_screen.get("token"),
                    "actual": source.get("token"),
                })
            contract_endpoint = contract_by_endpoint.get((source.get("method"), source.get("path")))
            if contract_endpoint:
                expected_query = contract_endpoint.get("query") or []
                actual_query = source.get("query") or []
                if expected_query != actual_query:
                    errors["query_mismatches"].append({
                        "screen": screen_id,
                        "source": source.get("name"),
                        "method": source.get("method"),
                        "path": source.get("path"),
                        "expected_query": expected_query,
                        "actual_query": actual_query,
                    })

        if not pack_screen.get("blocks"):
            errors["invalid_blocks"].append({
                "screen": screen_id,
                "error": "screen must define at least one block",
            })
        for block in pack_screen.get("blocks", []):
            if block.get("type") not in allowed_block_types:
                errors["invalid_blocks"].append({
                    "screen": screen_id,
                    "block": block.get("type"),
                    "error": "unsupported block type",
                })
            if not block.get("source"):
                errors["invalid_blocks"].append({
                    "screen": screen_id,
                    "block": block.get("type"),
                    "error": "block must declare a source",
                })

        actions = set(pack_screen.get("actions", []))
        invalid_actions = sorted(actions - allowed_actions)
        if invalid_actions:
            errors["invalid_actions"].append({
                "screen": screen_id,
                "actions": invalid_actions,
            })
        if blueprint_screen.get("mode") == "read_only" and actions:
            errors["invalid_actions"].append({
                "screen": screen_id,
                "actions": sorted(actions),
                "error": "read-only screens must not define actions",
            })
        if blueprint_screen.get("mode") == "guarded_config" and not actions:
            errors["invalid_actions"].append({
                "screen": screen_id,
                "error": "guarded config screens must define explicit allowed actions",
            })

    ok = not any(errors.values())
    return {
        "ok": ok,
        "path": str(build_pack_path),
        "version": build_pack.get("version"),
        "screens_count": len(pack_by_id),
        "source_blueprint": str(source_blueprint_path),
        "errors": errors,
    }
