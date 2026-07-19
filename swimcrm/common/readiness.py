from pathlib import Path

from django.conf import settings
from django.db import DEFAULT_DB_ALIAS, connections
from django.db.migrations.executor import MigrationExecutor

from common.nocobase_blueprint import (
    validate_nocobase_blueprint,
    validate_nocobase_build_pack,
)


def _check_database():
    with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return {"ok": True}


def _check_migrations():
    connection = connections[DEFAULT_DB_ALIAS]
    executor = MigrationExecutor(connection)
    targets = executor.loader.graph.leaf_nodes()
    pending = [
        f"{migration.app_label}.{migration.name}"
        for migration, backwards in executor.migration_plan(targets)
        if not backwards
    ]
    return {"ok": not pending, "pending": pending}


def _check_writable_directory(path):
    directory = Path(path)
    details = {
        "path": str(directory),
        "exists": directory.exists(),
        "is_dir": directory.is_dir(),
    }
    if not details["exists"] or not details["is_dir"]:
        return {"ok": False, **details}

    probe = directory / ".readiness-write-test"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError as exc:
        return {"ok": False, **details, "writable": False, "error": str(exc)}
    return {"ok": True, **details, "writable": True}


def _check_runtime_path(path):
    runtime_dir = Path(path)
    source_dir = Path(settings.BASE_DIR).resolve()
    inside_source = False
    try:
        resolved = runtime_dir.resolve()
        inside_source = resolved == source_dir or source_dir in resolved.parents
    except OSError:
        resolved = runtime_dir

    # Development can keep runtime files near the source tree; production cannot.
    ok = settings.DEBUG or not inside_source
    return {
        "ok": ok,
        "path": str(runtime_dir),
        "inside_source_tree": inside_source,
        "production_required": not settings.DEBUG,
    }


def _check_secret(name, value):
    required = not settings.DEBUG
    configured = bool(value)
    return {
        "ok": configured or not required,
        "configured": configured,
        "required": required,
    }


def build_readiness_report():
    checks = {}

    for name, checker in {
        "database": _check_database,
        "migrations": _check_migrations,
    }.items():
        try:
            checks[name] = checker()
        except Exception as exc:  # pragma: no cover - defensive diagnostics
            checks[name] = {"ok": False, "error": str(exc)}

    checks["media_root"] = _check_writable_directory(settings.MEDIA_ROOT)
    checks["runtime_dir"] = _check_runtime_path(settings.RUNTIME_DIR)
    checks["nocobase_bridge_token"] = _check_secret(
        "NOCOBASE_BRIDGE_TOKEN", settings.NOCOBASE_BRIDGE_TOKEN)
    checks["nocobase_config_token"] = _check_secret(
        "NOCOBASE_CONFIG_TOKEN", settings.NOCOBASE_CONFIG_TOKEN)
    checks["nocobase_first_screens"] = validate_nocobase_blueprint()
    checks["nocobase_screen_build_pack"] = validate_nocobase_build_pack()
    checks["default_language"] = {
        "ok": bool(settings.SWIMCRM_DEFAULT_LANGUAGE),
        "code": settings.SWIMCRM_DEFAULT_LANGUAGE,
    }

    return {
        "ok": all(check.get("ok") for check in checks.values()),
        "service": "swimcrm",
        "component": "backend",
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "checks": checks,
    }
