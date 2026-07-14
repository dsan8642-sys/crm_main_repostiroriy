"""Single cron/Celery entrypoint for due background work."""
from django.core.management.base import BaseCommand

from notifications.jobs import run_due_jobs


class Command(BaseCommand):
    help = "Run due background jobs: notifications and receipt cleanup."

    def handle(self, *args, **options):
        result = run_due_jobs()
        notifications = result["notifications"]
        receipts = result["receipts_deleted"]
        self.stdout.write(self.style.SUCCESS(
            "Due jobs completed: "
            f"notifications enqueued={notifications['enqueued']}, "
            f"sent={notifications['sent']}, "
            f"failed={notifications['failed']}, "
            f"receipts_deleted={receipts}"
        ))
