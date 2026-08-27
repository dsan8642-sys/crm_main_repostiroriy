from billing.services import purge_expired_receipts
from dataio.services import purge_expired_import_batches
from notifications.services import run_scheduler


def run_due_jobs():
    notifications = run_scheduler()
    receipts_deleted = purge_expired_receipts()
    import_batches_deleted = purge_expired_import_batches()
    return {
        "notifications": notifications,
        "receipts_deleted": receipts_deleted,
        "import_batches_deleted": import_batches_deleted,
    }
