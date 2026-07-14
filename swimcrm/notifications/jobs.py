from billing.services import purge_expired_receipts
from notifications.services import run_scheduler


def run_due_jobs():
    notifications = run_scheduler()
    receipts_deleted = purge_expired_receipts()
    return {
        "notifications": notifications,
        "receipts_deleted": receipts_deleted,
    }
