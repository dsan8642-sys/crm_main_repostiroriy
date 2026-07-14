from django.core.management.base import BaseCommand

from dataio.backup import create_postgres_backup


class Command(BaseCommand):
    help = "Create a PostgreSQL custom-format backup with pg_dump."

    def add_arguments(self, parser):
        parser.add_argument("--out-dir", default=None)

    def handle(self, *args, **options):
        backup_file = create_postgres_backup(options["out_dir"])
        self.stdout.write(self.style.SUCCESS(f"Backup written: {backup_file}"))
