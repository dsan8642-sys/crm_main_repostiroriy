import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("swimcrm")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "run-due-jobs-every-10-minutes": {
        "task": "notifications.tasks.run_due_jobs",
        "schedule": crontab(minute=os.environ.get("DUE_JOBS_CRON_MINUTE", "*/10")),
    },
    "purge-expired-receipts-nightly": {
        "task": "billing.tasks.purge_expired_receipts_task",
        "schedule": crontab(
            hour=os.environ.get("PURGE_RECEIPTS_CRON_HOUR", "3"),
            minute=os.environ.get("PURGE_RECEIPTS_CRON_MINUTE", "15"),
        ),
    },
    "backup-postgres-nightly": {
        "task": "dataio.tasks.backup_postgres",
        "schedule": crontab(
            hour=os.environ.get("POSTGRES_BACKUP_CRON_HOUR", "2"),
            minute=os.environ.get("POSTGRES_BACKUP_CRON_MINUTE", "0"),
        ),
    },
}
