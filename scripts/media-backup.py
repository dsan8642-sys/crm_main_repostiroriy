"""Archive and verify MEDIA_ROOT alongside a PostgreSQL dump."""
import argparse
import hashlib
import json
import os
import tempfile
import zipfile
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive(source, target):
    source = Path(source).resolve()
    target = Path(target).resolve()
    if not source.is_dir():
        raise ValueError(f"MEDIA_ROOT does not exist: {source}")
    if source == target.parent or source in target.parents:
        raise ValueError("Archive must be outside MEDIA_ROOT")
    files = {}
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as bundle:
        for path in sorted(source.rglob("*")):
            if not path.is_file():
                continue
            if path.is_symlink():
                raise ValueError(f"Symlink in MEDIA_ROOT: {path}")
            name = path.relative_to(source).as_posix()
            data = path.read_bytes()
            files[name] = digest(data)
            bundle.writestr(name, data)
        bundle.writestr("_swimcrm_manifest.json", json.dumps(files, sort_keys=True))
    target.with_suffix(target.suffix + ".sha256").write_text(digest(target.read_bytes()), encoding="ascii")
    return len(files)


def verify(target):
    target = Path(target).resolve()
    expected = target.with_suffix(target.suffix + ".sha256").read_text(encoding="ascii").strip()
    if digest(target.read_bytes()) != expected:
        raise ValueError("Media archive SHA-256 mismatch")
    with zipfile.ZipFile(target) as bundle:
        names = bundle.namelist()
        if names.count("_swimcrm_manifest.json") != 1 or len(names) != len(set(names)):
            raise ValueError("Invalid media archive manifest")
        files = json.loads(bundle.read("_swimcrm_manifest.json"))
        if set(names) != set(files) | {"_swimcrm_manifest.json"}:
            raise ValueError("Media archive file list mismatch")
        with tempfile.TemporaryDirectory(prefix="swimcrm-media-restore-", dir=target.parent) as temp:
            root = Path(temp).resolve()
            for name, checksum in files.items():
                path = (root / name).resolve()
                if root not in path.parents or name.startswith("/"):
                    raise ValueError("Unsafe media archive path")
                data = bundle.read(name)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                if digest(path.read_bytes()) != checksum:
                    raise ValueError(f"Media restore checksum mismatch: {name}")
    return len(files)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("create", "verify"))
    parser.add_argument("archive")
    parser.add_argument("--media-root", default=os.environ.get("MEDIA_ROOT"))
    args = parser.parse_args()
    if args.action == "create":
        if not args.media_root:
            parser.error("MEDIA_ROOT is required")
        count = archive(args.media_root, args.archive)
    else:
        count = verify(args.archive)
    print(f"Media {args.action} OK: {count} files")
