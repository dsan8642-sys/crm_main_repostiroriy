from celery import shared_task

from .services import purge_expired_receipts


@shared_task(name="billing.tasks.purge_expired_receipts_task")
def purge_expired_receipts_task():
    return purge_expired_receipts()
