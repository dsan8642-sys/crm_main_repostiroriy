"""Rule 10: daily background job (wire to Celery beat / BullMQ in production).
Scrubs receipt files older than RECEIPT_RETENTION_DAYS; keeps Payment records."""
from django.core.management.base import BaseCommand

from billing.services import purge_expired_receipts


class Command(BaseCommand):
    help = "Удаляет файлы чеков старше срока хранения (Payment сохраняется)."

    def handle(self, *args, **options):
        n = purge_expired_receipts()
        self.stdout.write(self.style.SUCCESS(f"Удалено файлов чеков: {n}"))
