"""Module 5.6: run the notification scheduler once. Hook to Celery beat / cron
(e.g. every 5–15 min). Idempotent: dedup_key prevents duplicate sends."""
from django.core.management.base import BaseCommand

from notifications.services import run_scheduler


class Command(BaseCommand):
    help = "Подобрать адресатов по активным правилам и отправить уведомления."

    def handle(self, *args, **options):
        result = run_scheduler()
        self.stdout.write(self.style.SUCCESS(
            f"В очередь: {result['enqueued']} · отправлено: {result['sent']} · "
            f"ошибок: {result['failed']}"))
