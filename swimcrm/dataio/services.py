from django.utils import timezone

from .models import ImportBatch, ImportBatchStatus


def purge_expired_import_batches(now=None):
    """Delete expired previews so staged personal data does not linger."""
    now = now or timezone.now()
    deleted, _details = ImportBatch.objects.filter(
        status=ImportBatchStatus.PREVIEWED,
        preview_expires_at__lte=now,
    ).delete()
    return deleted
