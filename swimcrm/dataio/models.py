from django.db import models
from django.utils import timezone


class ImportBatch(models.Model):
    """Module 5.10: a committed import; supports explicit rollback (откат)."""
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    source_name = models.CharField(max_length=255, blank=True)
    created_student_ids = models.JSONField(default=list, blank=True)
    created_group_ids = models.JSONField(default=list, blank=True)
    created_parent_ids = models.JSONField(default=list, blank=True)
    rows_total = models.PositiveIntegerField(default=0)
    rows_imported = models.PositiveIntegerField(default=0)
    is_rolled_back = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        state = "откачен" if self.is_rolled_back else "применён"
        return f"Импорт {self.created_at:%d.%m %H:%M} · {self.rows_imported}/{self.rows_total} ({state})"
