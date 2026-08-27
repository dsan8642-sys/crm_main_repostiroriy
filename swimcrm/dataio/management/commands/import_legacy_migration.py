import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.exceptions import ObjectDoesNotExist
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from dataio.legacy_migration import execute_manifest, load_manifest, manifest_sha256


class Command(BaseCommand):
    help = "Validate or atomically commit the approved one-off legacy migration manifest."

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--commit", action="store_true")
        parser.add_argument("--manifest", required=True)
        parser.add_argument("--source-workbook", required=True)
        parser.add_argument("--actor-id", type=int, required=True)
        parser.add_argument("--run-id")
        parser.add_argument("--confirm")
        parser.add_argument("--report")

    def handle(self, *args, **options):
        try:
            manifest = load_manifest(options["manifest"])
            actor = User.objects.get(id=options["actor_id"])
            if options["commit"]:
                digest = manifest_sha256(manifest)
                if options["run_id"] != manifest.get("run_id"):
                    raise CommandError("--run-id must exactly match the manifest.")
                expected = f"COMMIT {manifest['run_id']} {digest}"
                if options["confirm"] != expected:
                    raise CommandError(f"--confirm must exactly equal: {expected}")
            report = execute_manifest(
                manifest, options["source_workbook"], actor, commit=options["commit"])
        except (ValidationError, ObjectDoesNotExist) as exc:
            message = "; ".join(exc.messages) if isinstance(exc, ValidationError) else "Actor does not exist."
            raise CommandError(message) from exc
        if options["report"]:
            Path(options["report"]).write_text(
                json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
        self.stdout.write(json.dumps(report, ensure_ascii=False, sort_keys=True))
