import os
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _pg_tool(name):
    pg_bin = os.environ.get("POSTGRES_BIN", r"C:\Program Files\PostgreSQL\17\bin")
    path = Path(pg_bin) / name
    if not path.exists():
        raise ImproperlyConfigured(f"PostgreSQL tool not found: {path}")
    return str(path)


def create_postgres_backup(out_dir=None):
    db_name = os.environ.get("POSTGRES_DB")
    if not db_name:
        raise ImproperlyConfigured("POSTGRES_DB is required for PostgreSQL backup")

    out_path = Path(out_dir or os.environ.get("BACKUP_DIR", settings.BASE_DIR.parent / "backups"))
    out_path.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_file = out_path / f"{db_name}-{stamp}.dump"

    env = os.environ.copy()
    password = os.environ.get("POSTGRES_PASSWORD")
    if password:
        env["PGPASSWORD"] = password

    cmd = [
        _pg_tool("pg_dump.exe"),
        "-w",
        "-h", os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        "-p", os.environ.get("POSTGRES_PORT", "5432"),
        "-U", os.environ.get("POSTGRES_USER", "postgres"),
        "-d", db_name,
        "-Fc",
        "-f", str(backup_file),
    ]
    subprocess.run(cmd, env=env, check=True)
    return backup_file
