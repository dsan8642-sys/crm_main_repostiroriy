from unittest.mock import patch
from datetime import timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from config.celery import app
from dataio.models import ImportBatch, ImportBatchStatus
from dataio.services import purge_expired_import_batches
from dataio.tasks import backup_postgres_task
from notifications.jobs import run_due_jobs


class CeleryScheduleRule(SimpleTestCase):
    def test_beat_schedule_contains_operational_jobs(self):
        schedule = app.conf.beat_schedule

        self.assertEqual(
            schedule["run-due-jobs-every-10-minutes"]["task"],
            "notifications.tasks.run_due_jobs",
        )
        self.assertEqual(
            schedule["backup-postgres-nightly"]["task"],
            "dataio.tasks.backup_postgres",
        )


class BackgroundJobRule(TestCase):
    def test_run_due_jobs_combines_notifications_and_receipt_cleanup(self):
        with patch("notifications.jobs.run_scheduler") as scheduler, \
                patch("notifications.jobs.purge_expired_receipts") as purge, \
                patch("notifications.jobs.purge_expired_import_batches") as purge_imports:
            scheduler.return_value = {"enqueued": 1, "sent": 1, "failed": 0}
            purge.return_value = 2
            purge_imports.return_value = 3

            result = run_due_jobs()

        self.assertEqual(result["notifications"]["sent"], 1)
        self.assertEqual(result["receipts_deleted"], 2)
        self.assertEqual(result["import_batches_deleted"], 3)

    def test_backup_task_returns_created_file_path(self):
        with patch("dataio.tasks.create_postgres_backup") as backup:
            backup.return_value = "backups/swimcrm-test.dump"

            result = backup_postgres_task()

        self.assertEqual(result["backup_file"], "backups/swimcrm-test.dump")

    def test_expired_import_cleanup_keeps_committed_batches(self):
        expired_at = timezone.now() - timedelta(minutes=1)
        expired = ImportBatch.objects.create(
            status=ImportBatchStatus.PREVIEWED,
            preview_expires_at=expired_at,
            input_data={"rows": [{"email": "private@example.com"}]},
        )
        committed = ImportBatch.objects.create(
            status=ImportBatchStatus.COMMITTED,
            preview_expires_at=expired_at,
        )

        deleted = purge_expired_import_batches()

        self.assertEqual(deleted, 1)
        self.assertFalse(ImportBatch.objects.filter(pk=expired.pk).exists())
        self.assertTrue(ImportBatch.objects.filter(pk=committed.pk).exists())
